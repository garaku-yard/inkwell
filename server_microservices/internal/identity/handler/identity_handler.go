package handler

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"scriptlith/server_microservices/internal/identity/domain"
	"scriptlith/server_microservices/internal/identity/service"
	"scriptlith/server_microservices/pkg/grpc/common"
	identitypb "scriptlith/server_microservices/pkg/grpc/identity"
)

// IdentityHandler implements the gRPC Identity service
type IdentityHandler struct {
	identitypb.UnimplementedIdentityServiceServer
	authService service.AuthService
}

// NewIdentityHandler creates a new IdentityHandler
func NewIdentityHandler(authService service.AuthService) *IdentityHandler {
	return &IdentityHandler{
		authService: authService,
	}
}

// Register handles user registration
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
	}, nil
}

// Login handles user authentication
func (h *IdentityHandler) Login(ctx context.Context, req *identitypb.LoginRequest) (*identitypb.LoginResponse, error) {
	serviceReq := &service.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	}

	resp, err := h.authService.Login(ctx, serviceReq)
	if err != nil {
		return nil, h.handleError(err)
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
	}, nil
}

// RefreshToken handles token refresh
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

// ValidateToken handles token validation
func (h *IdentityHandler) ValidateToken(ctx context.Context, req *identitypb.ValidateTokenRequest) (*identitypb.ValidateTokenResponse, error) {
	userInfo, err := h.authService.ValidateToken(ctx, req.AccessToken)
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
		ExpiresAt: timeToCommonTimestamp(userInfo.CreatedAt), // Placeholder
	}, nil
}

// GetUser handles getting user profile
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
			Id:        profile.ID.String(),
			Email:     profile.Email,
			Username:  profile.Username,
			UserTag:   profile.UserTag,
			FirstName: stringValue(profile.FirstName),
			LastName:  stringValue(profile.LastName),
			AvatarUrl: stringValue(profile.AvatarURL),
			CreatedAt: timeToCommonTimestamp(profile.CreatedAt),
			UpdatedAt: timeToCommonTimestamp(profile.UpdatedAt),
			IsActive:  profile.IsActive,
			Role:      profile.Role,
		},
	}, nil
}

// GetUserByUsernameTag handles getting user by username and tag
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

// Placeholder implementations for required methods
func (h *IdentityHandler) GetUsers(ctx context.Context, req *identitypb.GetUsersRequest) (*identitypb.GetUsersResponse, error) {
	return nil, status.Error(codes.Unimplemented, "GetUsers not implemented")
}

func (h *IdentityHandler) UpdateUser(ctx context.Context, req *identitypb.UpdateUserRequest) (*identitypb.UpdateUserResponse, error) {
	return nil, status.Error(codes.Unimplemented, "UpdateUser not implemented")
}

func (h *IdentityHandler) ChangePassword(ctx context.Context, req *identitypb.ChangePasswordRequest) (*identitypb.ChangePasswordResponse, error) {
	return nil, status.Error(codes.Unimplemented, "ChangePassword not implemented")
}

// Helper functions
func (h *IdentityHandler) handleError(err error) error {
	switch err {
	case domain.ErrUserNotFound:
		return status.Error(codes.NotFound, "user not found")
	case domain.ErrEmailExists:
		return status.Error(codes.AlreadyExists, "email already exists")
	case domain.ErrUsernameExists:
		return status.Error(codes.AlreadyExists, "username already exists")
	case domain.ErrInvalidCredentials:
		return status.Error(codes.Unauthenticated, "invalid credentials")
	case domain.ErrInvalidToken:
		return status.Error(codes.Unauthenticated, "invalid token")
	default:
		return status.Error(codes.Internal, fmt.Sprintf("internal server error: %v", err))
	}
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func timeToCommonTimestamp(t time.Time) *common.Timestamp {
	return &common.Timestamp{
		Seconds: t.Unix(),
		Nanos:   int32(t.Nanosecond()),
	}
}
