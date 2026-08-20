import React from 'react';

/**
 * Catches render-time errors so one broken page shows a recoverable message
 * instead of unmounting the whole app and leaving a blank white screen.
 *
 * Must be a class component — React has no hook equivalent of
 * componentDidCatch.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0 }}>Something went wrong on this page</h2>
        <p style={{ color: '#7889a8', maxWidth: 460 }}>
          The rest of the portal is still working. Try again, or head back to
          your dashboard.
        </p>

        {import.meta.env.DEV && (
          <pre
            style={{
              maxWidth: '100%',
              overflowX: 'auto',
              textAlign: 'left',
              background: '#f0f4fb',
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {error.message}
          </pre>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn--primary" onClick={this.handleReset}>
            Try again
          </button>
          <button
            className="btn"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
