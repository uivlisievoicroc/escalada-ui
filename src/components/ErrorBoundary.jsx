import React from 'react';
import { debugError } from '../utilis/debug';

/**
 * Error Boundary component to catch React errors
 * Prevents entire app crash from component errors
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console in development
    debugError('Error caught by boundary:', error, errorInfo);

    // TODO: Log to error reporting service (Sentry, etc.)
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <h1 style={styles.title}>⚠️ Something went wrong</h1>
            <p style={styles.message}>
              We're sorry, but something unexpected happened. Please refresh the page or contact
              support.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details (Dev Only)</summary>
                <pre style={styles.pre}>
                  {this.state.error?.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <button onClick={() => window.location.reload()} style={styles.button}>
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  content: {
    padding: '2rem',
    backgroundColor: 'white',
    borderRadius: '0.5rem',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    maxWidth: '500px',
    textAlign: 'center',
  },
  title: {
    marginTop: 0,
    marginBottom: '1rem',
    color: '#dc2626',
    fontSize: '1.5rem',
  },
  message: {
    color: '#6b7280',
    marginBottom: '2rem',
    fontSize: '1rem',
  },
  details: {
    marginBottom: '2rem',
    textAlign: 'left',
    backgroundColor: '#f9fafb',
    padding: '1rem',
    borderRadius: '0.375rem',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: '0.5rem',
  },
  pre: {
    margin: 0,
    overflow: 'auto',
    fontSize: '0.875rem',
    color: '#111827',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  button: {
    padding: '0.5rem 1.5rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

// Hover effect for button (add via CSS in real app)
// button:hover { background-color: #2563eb; }

export default ErrorBoundary;
