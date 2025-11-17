import { AlertCircle, XCircle } from 'lucide-react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  type?: 'error' | 'warning';
}

export default function ErrorAlert({
  title,
  message,
  onRetry,
  onDismiss,
  type = 'error',
}: ErrorAlertProps) {
  const isError = type === 'error';
  const Icon = isError ? XCircle : AlertCircle;
  const colorClasses = isError
    ? 'bg-red-50 border-red-200 text-red-800'
    : 'bg-orange-50 border-orange-200 text-orange-800';
  const iconColor = isError ? 'text-red-600' : 'text-orange-600';

  return (
    <div className={`rounded-lg border p-4 ${colorClasses}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 ${iconColor} mt-0.5 flex-shrink-0`} />
        <div className="flex-1">
          {title && <h3 className="font-semibold mb-1">{title}</h3>}
          <p className="text-sm">{message}</p>
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex gap-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition ${
                    isError
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  Retry
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white rounded border border-gray-300 hover:bg-gray-50 transition"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
