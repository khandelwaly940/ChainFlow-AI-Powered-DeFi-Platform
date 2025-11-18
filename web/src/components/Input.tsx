import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div className="mb-5">
      {label && (
        <label className="block text-sm font-semibold text-gray-300 mb-2.5 tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`w-full px-4 py-3 bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl text-white placeholder-gray-500 
          focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 
          transition-all duration-200 hover:border-gray-600/50
          shadow-sm hover:shadow-md ${className}`}
        {...props}
      />
    </div>
  );
}

