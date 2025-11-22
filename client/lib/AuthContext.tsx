"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode";

interface DecodedToken {
  sub: string;        // Subject (User ID as UUID string)
  user_id: string;    // Also includes user_id for compatibility
  email: string;      // User email
  username: string;   // Username
  role: string;       // User role
  exp: number;        // Expiration timestamp
  iat: number;        // Issued at timestamp
  nbf: number;        // Not before timestamp
  iss: string;        // Issuer
}

interface AuthContextType {
  isAuthenticated: boolean;
  logout: () => void;
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{
    id: string;
    email: string;
    username: string;
    role: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const decodedToken: DecodedToken = jwtDecode(token);
        if (decodedToken.exp * 1000 > Date.now()) {
          // Validate that the user ID is a proper UUID (36 characters with dashes)
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(decodedToken.sub)) {
            setIsAuthenticated(true);
            setUser({
              id: decodedToken.sub,
              email: decodedToken.email,
              username: decodedToken.username,
              role: decodedToken.role,
            });
          } else {
            // Clear old token with invalid UUID format
            console.log('Clearing old token with invalid user ID format');
            localStorage.removeItem("authToken");
          }
        } else {
          localStorage.removeItem("authToken");
        }
      }
    } catch (error) {
      localStorage.removeItem("authToken");
      console.error("Invalid token found", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("authToken");
    setIsAuthenticated(false);
    setUser(null);
    router.push("/login");
  };

  if (isLoading) {
    return <div>Loading Authentication...</div>;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, logout }}>
      {children}
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
