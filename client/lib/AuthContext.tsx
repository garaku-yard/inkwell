"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { jwtDecode } from "jwt-decode";

// UPDATED: The DecodedToken interface now matches the new JWT claims from the Go server.
interface DecodedToken {
  sub: string; // Subject (user's UUID)
  nam: string; // Full Name
  usn: string; // Username
  tag: string; // Username Tag
  eml: string; // Email
  exp: number; // Expiration time
}

// UPDATED: The context now provides the user's name and UUID string.
interface AuthContextType {
  isAuthenticated: boolean;
  logout: () => void;
  userName: string | null;
  userId: string | null; // Changed to string to hold the UUID
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null); // Changed to string
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const decodedToken: DecodedToken = jwtDecode(token);
        // Check if the token is expired
        if (decodedToken.exp * 1000 > Date.now()) {
          setIsAuthenticated(true);
          // Set the state with the new values from the token
          setUserName(decodedToken.nam);
          setUserId(decodedToken.sub); // The 'sub' claim is the UUID string
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
    setUserName(null);
    setUserId(null);
    router.push("/login");
  };

  if (isLoading) {
    // You can replace this with a proper loading spinner component
    return <div>Loading Authentication...</div>;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, userName, userId, logout }}>
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
