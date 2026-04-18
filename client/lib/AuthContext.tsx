"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode";
import { SessionExpiryModal } from "@/components/session-expiry-modal";

interface DecodedToken {
  sub: string;
  user_id?: string;
  eml?: string;
  usn?: string;
  tag?: string;
  email?: string;
  username?: string;
  user_tag?: string;
  role?: string;
  exp: number;
  iat: number;
  nbf?: number;
  iss?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => boolean;
  logout: () => void;
  user: {
    id: string;
    email: string;
    username: string;
    tag: string;
    role: string;
  } | null;
  updateUser: (updates: Partial<{ email: string; username: string }>) => void;
  showSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check interval for session expiry (every 30 seconds)
const SESSION_CHECK_INTERVAL = 30 * 1000;
// Warning threshold (5 minutes before expiry)
const SESSION_WARNING_THRESHOLD = 5 * 60 * 1000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    username: string;
    tag: string;
    role: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionModalType, setSessionModalType] = useState<"warning" | "expired" | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const router = useRouter();
  const sessionCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);

  const clearIntervals = useCallback(() => {
    if (sessionCheckInterval.current) {
      clearInterval(sessionCheckInterval.current);
      sessionCheckInterval.current = null;
    }
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("authToken");
    setIsAuthenticated(false);
    setUser(null);
    setSessionModalType(null);
    clearIntervals();
    router.push("/login");
  }, [router, clearIntervals]);

  const showSessionExpired = useCallback(() => {
    setSessionModalType("expired");
  }, []);

  const handleModalLogin = useCallback((token: string) => {
    try {
      localStorage.setItem("authToken", token);
      const decodedToken: DecodedToken = jwtDecode(token);

      if (decodedToken.exp * 1000 > Date.now()) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(decodedToken.sub)) {
          setIsAuthenticated(true);
          setUser({
            id: decodedToken.sub,
            email: decodedToken.email || decodedToken.eml || '',
            username: decodedToken.username || decodedToken.usn || '',
            tag: decodedToken.tag || decodedToken.user_tag || '',
            role: decodedToken.role || 'user',
          });
          setSessionModalType(null);
          return;
        }
      }
      throw new Error('Invalid token');
    } catch (error) {
      localStorage.removeItem("authToken");
      console.error("Login failed", error);
    }
  }, []);

  const extendSession = useCallback(() => {
    // For now, just dismiss the warning - the user's activity keeps them logged in
    // In a production app with refresh tokens, you would call a refresh endpoint here
    setSessionModalType(null);
  }, []);

  const checkSessionExpiry = useCallback(() => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        if (isAuthenticated) {
          setSessionModalType("expired");
        }
        return;
      }

      const decodedToken: DecodedToken = jwtDecode(token);
      const expiryTime = decodedToken.exp * 1000;
      const now = Date.now();
      const timeUntilExpiry = expiryTime - now;

      // If token is expired, show expired modal
      if (timeUntilExpiry <= 0) {
        localStorage.removeItem("authToken");
        setSessionModalType("expired");
        return;
      }

      // If close to expiry, show warning
      if (timeUntilExpiry <= SESSION_WARNING_THRESHOLD && sessionModalType !== "warning") {
        setTimeRemaining(Math.floor(timeUntilExpiry / 1000));
        setSessionModalType("warning");
        
        // Start countdown
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
        }
        countdownInterval.current = setInterval(() => {
          setTimeRemaining(prev => {
            if (prev <= 1) {
              // Time's up
              localStorage.removeItem("authToken");
              setSessionModalType("expired");
              if (countdownInterval.current) {
                clearInterval(countdownInterval.current);
                countdownInterval.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error checking session:", error);
      setSessionModalType("expired");
    }
  }, [isAuthenticated, sessionModalType]);

  // Initial auth check on mount
  useEffect(() => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const decodedToken: DecodedToken = jwtDecode(token);

        if (decodedToken.exp * 1000 > Date.now()) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(decodedToken.sub)) {
            setIsAuthenticated(true);
            setUser({
              id: decodedToken.sub,
              email: decodedToken.email || decodedToken.eml || '',
              username: decodedToken.username || decodedToken.usn || '',
              tag: decodedToken.tag || decodedToken.user_tag || '',
              role: decodedToken.role || 'user',
            });
          } else {
            localStorage.removeItem("authToken");
          }
        } else {
          // Token expired - show modal instead of redirect
          localStorage.removeItem("authToken");
          setSessionModalType("expired");
        }
      }
    } catch (error) {
      localStorage.removeItem("authToken");
      console.error("Invalid token found", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up periodic session check
  useEffect(() => {
    if (isAuthenticated && !sessionModalType) {
      // Check immediately
      checkSessionExpiry();
      
      // Set up interval to check periodically
      sessionCheckInterval.current = setInterval(checkSessionExpiry, SESSION_CHECK_INTERVAL);
    }

    return () => {
      if (sessionCheckInterval.current) {
        clearInterval(sessionCheckInterval.current);
        sessionCheckInterval.current = null;
      }
    };
  }, [isAuthenticated, sessionModalType, checkSessionExpiry]);

  // Listen for session-expired events from API calls
  useEffect(() => {
    const handleSessionExpiredEvent = () => {
      setSessionModalType("expired");
    };

    window.addEventListener("session-expired", handleSessionExpiredEvent);
    return () => {
      window.removeEventListener("session-expired", handleSessionExpiredEvent);
    };
  }, []);

  const updateUser = useCallback((updates: Partial<{ email: string; username: string }>) => {
    setUser(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  const login = (token: string) => {
    try {
      localStorage.setItem("authToken", token);
      const decodedToken: DecodedToken = jwtDecode(token);

      if (decodedToken.exp * 1000 > Date.now()) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(decodedToken.sub)) {
          setIsAuthenticated(true);
          setUser({
            id: decodedToken.sub,
            email: decodedToken.email || decodedToken.eml || '',
            username: decodedToken.username || decodedToken.usn || '',
            tag: decodedToken.tag || decodedToken.user_tag || '',
            role: decodedToken.role || 'user',
          });
          setSessionModalType(null);
          return true;
        } else {
          throw new Error('Invalid token format');
        }
      } else {
        throw new Error('Token expired');
      }
    } catch (error) {
      localStorage.removeItem("authToken");
      console.error("Invalid token", error);
      return false;
    }
  };

  if (isLoading) {
    return <div>Loading Authentication...</div>;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, updateUser, showSessionExpired }}>
      {children}
      <SessionExpiryModal
        isOpen={sessionModalType !== null}
        type={sessionModalType || "expired"}
        userEmail={user?.email}
        onExtendSession={extendSession}
        onLogin={handleModalLogin}
        onLogout={logout}
        timeRemaining={timeRemaining}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
