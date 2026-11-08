import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Lock, School, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

const ROLE_REDIRECTS = {
  Admin: '/admin',
  Teacher: '/teacher',
  Student: '/student',
  Parent: '/parent',
};

export default function LoginPage() {
  // An email, or a student's admission number.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await login(identifier.trim(), password);

    if (result.success) {
      toast.success('Welcome back!');
      navigate(ROLE_REDIRECTS[result.role] || '/');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="auth-page">
      {/* Hero Side */}
      <div className="auth-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 48,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
              }}
            >
              <School size={26} color="#fff" />
            </div>
            <span
              style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#fff',
              }}
            >
              SchoolPortal
            </span>
          </div>

          <h1
            style={{
              color: '#fff',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              marginBottom: 20,
            }}
          >
            Empowering
            <br />
            Education,
            <br />
            Digitally.
          </h1>
          <p
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: '1.0625rem',
              maxWidth: 360,
              lineHeight: 1.7,
              marginBottom: 48,
            }}
          >
            A unified portal for Admins, Teachers, Students, and Parents. Manage
            academics, finances, and communications — all in one place.
          </p>

          {[
            {
              label: 'Academic Results',
              desc: 'Automated grading & report cards',
            },
            {
              label: 'Fee Payments',
              desc: 'Paystack & Flutterwave integrated',
            },
            {
              label: 'Smart Attendance',
              desc: 'Daily tracking with analytics',
            },
          ].map((f) => (
            <div
              key={f.label}
              style={{
                display: 'flex',
                gap: 12,
                marginBottom: 20,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  // borderRadius: '50%',
                  background: 'var(--clr-accent)',
                  marginTop: 8,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                  }}
                >
                  {f.label}
                </div>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.875rem',
                  }}
                >
                  {f.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form Side */}
      <div className="auth-form-side">
        <div className="auth-form-card">
          <div style={{ marginBottom: 40 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--clr-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <School size={18} color="#fff" />
              </div>
              <span
                style={{
                  fontFamily: 'Sora, sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: 'var(--clr-text-1)',
                }}
              >
                SchoolPortal
              </span>
            </div>
            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--clr-text-1)',
                marginBottom: 6,
              }}
            >
              Sign in
            </h2>
            <p style={{ color: 'var(--clr-text-3)', fontSize: '0.9375rem' }}>
              Access your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="identifier">Email or admission number</label>
              <div style={{ position: 'relative' }}>
                <UserRound
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--clr-text-3)',
                  }}
                />
                {/* type="text", not "email": the browser would refuse an
                    admission number as an invalid address. */}
                <input
                  id="identifier"
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: 40 }}
                  placeholder="you@school.edu.ng or AO260012"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="form-group">
              <label
                htmlFor="password"
                style={{ display: 'flex', justifyContent: 'space-between' }}
              >
                Password
                <Link
                  to="/forgot-password"
                  style={{
                    color: 'var(--clr-primary)',
                    fontSize: '0.875rem',
                    fontWeight: 400,
                  }}
                >
                  Forgot password?
                </Link>
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--clr-text-3)',
                  }}
                />
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="form-control"
                  style={{ paddingLeft: 40, paddingRight: 44 }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--clr-text-3)',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 20,
                  color: '#991b1b',
                  fontSize: '0.875rem',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn--primary btn--full btn--lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="spinner"
                    style={{ width: 18, height: 18, borderWidth: 2 }}
                  />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p
            style={{
              textAlign: 'center',
              marginTop: 28,
              fontSize: '0.875rem',
              color: 'var(--clr-text-3)',
            }}
          >
            Students sign in with the admission number on their login slip. Lost
            it? Ask the school office for a new one.
          </p>
        </div>
      </div>
    </div>
  );
}
