
interface TxToastProps {
  message: string;
  type: "pending" | "success" | "error";
  onClose?: () => void;
}

export function TxToast({ message, type, onClose }: TxToastProps) {
  const bgColor =
    type === "success"
      ? "bg-green-600"
      : type === "error"
      ? "bg-red-600"
      : "bg-blue-600";

  return (
    <div
      className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3`}
    >
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="text-white hover:text-gray-200 font-bold"
        >
          ×
        </button>
      )}
    </div>
  );
}

