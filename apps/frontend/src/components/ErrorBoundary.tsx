import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="screen-container">
          <div className="text-center p-8">
            <h1 className="text-4xl font-bold text-red-600 mb-4">
              Terjadi Kesalahan
            </h1>
            <p className="text-xl text-gray-600 mb-6">
              Maaf, terjadi kesalahan yang tidak terduga.
            </p>
            <p className="text-sm text-gray-500 mb-8 font-mono bg-gray-100 p-4 rounded-lg max-w-lg mx-auto">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-primary text-white px-8 py-4 rounded-2xl text-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
