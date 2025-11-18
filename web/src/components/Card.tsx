import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "glass";
}

export function Card({ children, className = "", variant = "default" }: CardProps) {
  const baseClasses = "rounded-xl p-6 transition-all duration-300";
  
  const variantClasses = {
    default: "glass border-gray-800/50 shadow-lg",
    elevated: "bg-gray-900/95 border border-gray-800/80 shadow-2xl shadow-blue-500/5",
    glass: "glass-strong shadow-xl"
  };
  
  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}

