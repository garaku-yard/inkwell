package handler

import (
	"context"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"inkwell/server/internal/identity/domain"
	"inkwell/server/internal/identity/service"
	"inkwell/server/pkg/grpc/common"
	identitypb "inkwell/server/pkg/grpc/identity"
)

// IdentityHandler implements the gRPC IdentityServiceServer. It translates
// inbound proto messages to domain requests, delegates to the AuthService, and
// maps domain errors back to precise gRPC status codes.
type IdentityHandler struct {
	identitypb.UnimplementedIdentityServiceServer
	authService service.AuthService
}

// NewIdentityHandler creates an IdentityHandler backed by the provided AuthService.
func NewIdentityHandler(authService service.AuthService) *IdentityHandler {
	return &IdentityHandler{
		authService: authService,
	}
}

// Register creates a new user account and returns the user's profile alongside an
// access/refresh token pair. Returns AlreadyExists if the email or username is taken.
func (h *IdentityHandler) Register(ctx context.Context, req *identitypb.RegisterRequest) (*identitypb.RegisterResponse, error) {
	serviceReq := &service.RegisterRequest{
		Email:     req.Email,
		Username:  req.Username,
		Password:  req.Password,
		FirstName: stringPtr(req.FirstName),
		LastName:  stringPtr(req.LastName),
	}

	resp, err := h.authService.Register(ctx, serviceReq)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.RegisterResponse{
		User: &identitypb.User{
			Id:        resp.User.ID.String(),
			Email:     resp.User.Email,
			Username:  resp.User.Username,
			UserTag:   resp.User.UserTag,
			FirstName: stringValue(resp.User.FirstName),
			LastName:  stringValue(resp.User.LastName),
			AvatarUrl: stringValue(resp.User.AvatarURL),
			CreatedAt: timeToCommonTimestamp(resp.User.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(resp.User.UpdatedAt),
			IsActive:  resp.User.IsActive,
			Role:      resp.User.Role,
		},
		AccessToken:  resp.TokenPair.AccessToken,
		RefreshToken: resp.TokenPair.RefreshToken,
		SessionId:    resp.SessionID.String(),
	}, nil
}

// Login authenticates a user by email and password. On success it returns the
// user's profile and a fresh access/refresh token pair. Returns Unauthenticated
// if the credentials are invalid or the account is inactive.
func (h *IdentityHandler) Login(ctx context.Context, req *identitypb.LoginRequest) (*identitypb.LoginResponse, error) {
	serviceReq := &service.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
		TOTPCode: req.TotpCode,
	}

	resp, err := h.authService.Login(ctx, serviceReq)
	if err != nil {
		return nil, h.handleError(err)
	}

	// Password verified but 2FA is on and no (valid) code yet — tell the client
	// to prompt for it. No user/tokens in this response.
	if resp.TOTPRequired {
		return &identitypb.LoginResponse{TotpRequired: true}, nil
	}

	return &identitypb.LoginResponse{
		User: &identitypb.User{
			Id:        resp.User.ID.String(),
			Email:     resp.User.Email,
			Username:  resp.User.Username,
			UserTag:   resp.User.UserTag,
			FirstName: stringValue(resp.User.FirstName),
			LastName:  stringValue(resp.User.LastName),
			AvatarUrl: stringValue(resp.User.AvatarURL),
			CreatedAt: timeToCommonTimestamp(resp.User.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(resp.User.UpdatedAt),
			IsActive:  resp.User.IsActive,
			Role:      resp.User.Role,
		},
		AccessToken:  resp.TokenPair.AccessToken,
		RefreshToken: resp.TokenPair.RefreshToken,
		SessionId:    resp.SessionID.String(),
	}, nil
}

// RefreshToken exchanges a valid refresh token for a new access/refresh token pair.
// Returns Unauthenticated if the token is expired or invalid.
func (h *IdentityHandler) RefreshToken(ctx context.Context, req *identitypb.RefreshTokenRequest) (*identitypb.RefreshTokenResponse, error) {
	tokens, err := h.authService.RefreshToken(ctx, req.RefreshToken)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.RefreshTokenResponse{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
	}, nil
}

// ValidateToken checks whether an access token is currently valid. On failure it
// returns Valid:false rather than a gRPC error, so callers can handle expired sessions
// without treating them as hard failures.
func (h *IdentityHandler) ValidateToken(ctx context.Context, req *identitypb.ValidateTokenRequest) (*identitypb.ValidateTokenResponse, error) {
	userInfo, expiresAt, err := h.authService.ValidateToken(ctx, req.AccessToken)
	if err != nil {
		return &identitypb.ValidateTokenResponse{
			Valid: false,
		}, nil
	}

	return &identitypb.ValidateTokenResponse{
		Valid: true,
		User: &identitypb.User{
			Id:        userInfo.ID.String(),
			Email:     userInfo.Email,
			Username:  userInfo.Username,
			UserTag:   userInfo.UserTag,
			FirstName: stringValue(userInfo.FirstName),
			LastName:  stringValue(userInfo.LastName),
			AvatarUrl: stringValue(userInfo.AvatarURL),
			CreatedAt: timeToCommonTimestamp(userInfo.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(userInfo.UpdatedAt),
			IsActive:  userInfo.IsActive,
			Role:      userInfo.Role,
		},
		ExpiresAt: timeToCommonTimestamp(expiresAt),
	}, nil
}

// GetUser retrieves a user's public profile by UUID. Returns InvalidArgument if
// the ID cannot be parsed, or NotFound if no matching user exists.
func (h *IdentityHandler) GetUser(ctx context.Context, req *identitypb.GetUserRequest) (*identitypb.GetUserResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}

	profile, err := h.authService.GetUserProfile(ctx, userID)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.GetUserResponse{
		User: &identitypb.User{
			Id:          profile.ID.String(),
			Email:       profile.Email,
			Username:    profile.Username,
			UserTag:     profile.UserTag,
			FirstName:   stringValue(profile.FirstName),
			LastName:    stringValue(profile.LastName),
			AvatarUrl:   stringValue(profile.AvatarURL),
			CreatedAt:   timeToCommonTimestamp(profile.CreatedAt),
			UpdatedAt:   timeToCommonTimestamp(profile.UpdatedAt),
			IsActive:    profile.IsActive,
			Role:        profile.Role,
			TotpEnabled: profile.TOTPEnabled,
		},
	}, nil
}

// GetUserByUsernameTag retrieves a user's profile by their username and discriminator
// tag. Used by the collaboration handler to resolve @username mentions to email
// addresses when sending project invitations.
func (h *IdentityHandler) GetUserByUsernameTag(ctx context.Context, req *identitypb.GetUserByUsernameTagRequest) (*identitypb.GetUserResponse, error) {
	userInfo, err := h.authService.GetUserByUsernameTag(ctx, req.Username, req.UserTag)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.GetUserResponse{
		User: &identitypb.User{
			Id:        userInfo.ID.String(),
			Email:     userInfo.Email,
			Username:  userInfo.Username,
			UserTag:   userInfo.UserTag,
			FirstName: stringValue(userInfo.FirstName),
			LastName:  stringValue(userInfo.LastName),
			AvatarUrl: stringValue(userInfo.AvatarURL),
			CreatedAt: timeToCommonTimestamp(userInfo.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(userInfo.UpdatedAt),
			IsActive:  userInfo.IsActive,
			Role:      userInfo.Role,
		},
	}, nil
}

// GetUserByEmail returns the user with the given email address, if one exists.
func (h *IdentityHandler) GetUserByEmail(ctx context.Context, req *identitypb.GetUserByEmailRequest) (*identitypb.GetUserResponse, error) {
	userInfo, err := h.authService.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.GetUserResponse{
		User: &identitypb.User{
			Id:        userInfo.ID.String(),
			Email:     userInfo.Email,
			Username:  userInfo.Username,
			UserTag:   userInfo.UserTag,
			FirstName: stringValue(userInfo.FirstName),
			LastName:  stringValue(userInfo.LastName),
			AvatarUrl: stringValue(userInfo.AvatarURL),
			CreatedAt: timeToCommonTimestamp(userInfo.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(userInfo.UpdatedAt),
			IsActive:  userInfo.IsActive,
			Role:      userInfo.Role,
		},
	}, nil
}

// GetUsers is not yet implemented and always returns codes.Unimplemented.
func (h *IdentityHandler) GetUsers(ctx context.Context, req *identitypb.GetUsersRequest) (*identitypb.GetUsersResponse, error) {
	return nil, status.Error(codes.Unimplemented, "GetUsers not implemented")
}

// UpdateUser applies a partial profile update. It forwards only the non-nil fields
// to the auth service, then re-fetches the updated profile to return the current state.
func (h *IdentityHandler) UpdateUser(ctx context.Context, req *identitypb.UpdateUserRequest) (*identitypb.UpdateUserResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}

	serviceReq := &service.UpdateProfileRequest{}
	if req.Email != nil {
		serviceReq.Email = *req.Email
	}
	if req.Username != nil {
		serviceReq.Username = *req.Username
	}
	if req.AvatarUrl != nil {
		serviceReq.AvatarURL = *req.AvatarUrl
	}

	if err := h.authService.UpdateUserProfile(ctx, userID, serviceReq); err != nil {
		return nil, h.handleError(err)
	}

	profile, err := h.authService.GetUserProfile(ctx, userID)
	if err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.UpdateUserResponse{
		User: &identitypb.User{
			Id:          profile.ID.String(),
			Email:       profile.Email,
			Username:    profile.Username,
			UserTag:     profile.UserTag,
			FirstName:   stringValue(profile.FirstName),
			LastName:    stringValue(profile.LastName),
			AvatarUrl:   stringValue(profile.AvatarURL),
			CreatedAt:   timeToCommonTimestamp(profile.CreatedAt),
			UpdatedAt:   timeToCommonTimestamp(profile.UpdatedAt),
			IsActive:    profile.IsActive,
			Role:        profile.Role,
			TotpEnabled: profile.TOTPEnabled,
		},
	}, nil
}

// ChangePassword updates a user's password after verifying the current one. Returns
// Unauthenticated if the current password is wrong, or InvalidArgument if the user
// ID cannot be parsed.
func (h *IdentityHandler) ChangePassword(ctx context.Context, req *identitypb.ChangePasswordRequest) (*identitypb.ChangePasswordResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}

	serviceReq := &service.ChangePasswordRequest{
		CurrentPassword: req.CurrentPassword,
		NewPassword:     req.NewPassword,
	}

	if err := h.authService.ChangePassword(ctx, userID, serviceReq); err != nil {
		return nil, h.handleError(err)
	}

	return &identitypb.ChangePasswordResponse{Success: true}, nil
}

// VerifyPassword confirms the caller's password (a gate before destructive
// actions). Returns Unauthenticated on mismatch.
func (h *IdentityHandler) VerifyPassword(ctx context.Context, req *identitypb.VerifyPasswordRequest) (*identitypb.VerifyPasswordResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	if err := h.authService.VerifyPassword(ctx, userID, req.Password); err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.VerifyPasswordResponse{Valid: true}, nil
}

// DeleteAccount soft-deletes the caller's account and revokes all sessions. The
// row is hard-deleted later by the deletion reaper after the grace period.
func (h *IdentityHandler) DeleteAccount(ctx context.Context, req *identitypb.DeleteAccountRequest) (*identitypb.DeleteAccountResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	if err := h.authService.DeleteAccount(ctx, userID); err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.DeleteAccountResponse{Success: true}, nil
}

// RequestDataDeletion records a GDPR data-deletion request for the caller.
func (h *IdentityHandler) RequestDataDeletion(ctx context.Context, req *identitypb.RequestDataDeletionRequest) (*identitypb.RequestDataDeletionResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	r, err := h.authService.RequestDataDeletion(ctx, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.RequestDataDeletionResponse{Request: toProtoDataDeletion(r)}, nil
}

// GetDataDeletionStatus returns the caller's active data-deletion request, or
// NotFound when none exists.
func (h *IdentityHandler) GetDataDeletionStatus(ctx context.Context, req *identitypb.GetDataDeletionStatusRequest) (*identitypb.GetDataDeletionStatusResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	r, err := h.authService.GetDataDeletionStatus(ctx, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.GetDataDeletionStatusResponse{Request: toProtoDataDeletion(r)}, nil
}

// toProtoDataDeletion maps a domain DataDeletionRequest to its proto form, with
// RFC3339 timestamps (completed_at empty until fulfilled).
func toProtoDataDeletion(r *domain.DataDeletionRequest) *identitypb.DataDeletionRequest {
	pb := &identitypb.DataDeletionRequest{
		Id:                     r.ID.String(),
		UserId:                 r.UserID.String(),
		Status:                 r.Status,
		CreatedAt:              r.CreatedAt.UTC().Format(time.RFC3339),
		ExpectedCompletionDate: r.ExpectedCompletionDate.UTC().Format(time.RFC3339),
	}
	if r.CompletedAt != nil {
		pb.CompletedAt = r.CompletedAt.UTC().Format(time.RFC3339)
	}
	return pb
}

// ListSessions returns the caller's active sessions for the Security UI. The
// current_session_id (from the gateway's sid cookie) flags which row is the
// requesting device; an empty/invalid value just means "none current".
func (h *IdentityHandler) ListSessions(ctx context.Context, req *identitypb.ListSessionsRequest) (*identitypb.ListSessionsResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	var currentID uuid.UUID
	if req.CurrentSessionId != "" {
		if id, perr := uuid.Parse(req.CurrentSessionId); perr == nil {
			currentID = id
		}
	}

	sessions, err := h.authService.GetActiveSessions(ctx, userID, currentID)
	if err != nil {
		return nil, h.handleError(err)
	}

	out := make([]*identitypb.Session, len(sessions))
	for i, s := range sessions {
		out[i] = &identitypb.Session{
			SessionId:  s.ID.String(),
			CreatedAt:  timeToCommonTimestamp(s.CreatedAt),
			ExpiresAt:  timeToCommonTimestamp(s.ExpiresAt),
			LastUsedAt: timeToCommonTimestamp(s.LastUsedAt),
			DeviceInfo: s.DeviceInfo,
			IpAddress:  s.IPAddress,
			IsCurrent:  s.IsCurrent,
		}
	}
	return &identitypb.ListSessionsResponse{Sessions: out}, nil
}

// RevokeSession soft-revokes one of the caller's sessions. Revoking a session
// that isn't the caller's returns NotFound (ownership enforced in the service).
func (h *IdentityHandler) RevokeSession(ctx context.Context, req *identitypb.RevokeSessionRequest) (*identitypb.RevokeSessionResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	sessionID, err := uuid.Parse(req.SessionId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid session ID format")
	}
	if err := h.authService.RevokeSession(ctx, userID, sessionID); err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.RevokeSessionResponse{Success: true}, nil
}

// EnrollTOTP generates a pending TOTP secret and returns the enrolment data.
func (h *IdentityHandler) EnrollTOTP(ctx context.Context, req *identitypb.EnrollTOTPRequest) (*identitypb.EnrollTOTPResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	enrollment, err := h.authService.EnrollTOTP(ctx, userID)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.EnrollTOTPResponse{
		Secret:     enrollment.Secret,
		OtpauthUri: enrollment.OtpauthURI,
		QrPng:      enrollment.QRPNG,
	}, nil
}

// ConfirmTOTP verifies a code against the pending secret, enables 2FA, and
// returns one-time recovery codes.
func (h *IdentityHandler) ConfirmTOTP(ctx context.Context, req *identitypb.ConfirmTOTPRequest) (*identitypb.ConfirmTOTPResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	recoveryCodes, err := h.authService.ConfirmTOTP(ctx, userID, req.Code)
	if err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.ConfirmTOTPResponse{RecoveryCodes: recoveryCodes}, nil
}

// DisableTOTP turns 2FA off after verifying a current TOTP or recovery code.
func (h *IdentityHandler) DisableTOTP(ctx context.Context, req *identitypb.DisableTOTPRequest) (*identitypb.DisableTOTPResponse, error) {
	userID, err := uuid.Parse(req.UserId)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid user ID format")
	}
	if err := h.authService.DisableTOTP(ctx, userID, req.Code); err != nil {
		return nil, h.handleError(err)
	}
	return &identitypb.DisableTOTPResponse{Success: true}, nil
}

// handleError maps domain sentinel errors to gRPC status codes. It covers all error
// cases defined in the identity domain so callers receive precise codes rather than
// a blanket codes.Internal.
func (h *IdentityHandler) handleError(err error) error {
	switch err {
	case domain.ErrUserNotFound, domain.ErrSessionNotFound, domain.ErrDataDeletionRequestNotFound:
		return status.Error(codes.NotFound, err.Error())
	case domain.ErrEmailExists, domain.ErrUserTagTaken, domain.ErrUserAlreadyExists:
		return status.Error(codes.AlreadyExists, err.Error())
	case domain.ErrInvalidCredentials, domain.ErrInvalidToken,
		domain.ErrInvalidRefreshToken, domain.ErrTokenExpired, domain.ErrSessionExpired,
		domain.ErrInvalidTOTP:
		return status.Error(codes.Unauthenticated, err.Error())
	case domain.ErrTOTPAlreadyEnabled, domain.ErrTOTPNotEnrolled, domain.ErrTOTPNotEnabled:
		return status.Error(codes.FailedPrecondition, err.Error())
	case domain.ErrUserNotActive, domain.ErrEmailNotVerified:
		return status.Error(codes.PermissionDenied, err.Error())
	case domain.ErrWeakPassword, domain.ErrInvalidEmail, domain.ErrInvalidUsername:
		return status.Error(codes.InvalidArgument, err.Error())
	default:
		return status.Errorf(codes.Internal, "internal server error: %v", err)
	}
}

// stringPtr converts a non-empty string to a pointer. Returns nil for empty strings,
// which the domain layer uses to distinguish "not provided" from an explicit empty value.
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// stringValue dereferences a string pointer, returning "" for nil.
func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// timeToCommonTimestamp converts a time.Time value to the shared protobuf Timestamp type.
func timeToCommonTimestamp(t time.Time) *common.Timestamp {
	return &common.Timestamp{
		Seconds: t.Unix(),
		Nanos:   int32(t.Nanosecond()),
	}
}
