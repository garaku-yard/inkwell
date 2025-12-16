"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode";

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
  [key: string]: any;
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
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(decodedToken.sub)) {
            setIsAuthenticated(true);
            setUser({
              id: decodedToken.sub,
              email: decodedToken.email || decodedToken.eml || '',
              username: decodedToken.username || decodedToken.usn || '',
              role: decodedToken.role || 'user',
            });
          } else {
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
            role: decodedToken.role || 'user',
          });
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
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
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
