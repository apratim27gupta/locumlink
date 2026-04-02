'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function RequestOtp({ onOtpSent }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address.' })
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase().trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
          data: {
            app_name: process.env.NEXT_PUBLIC_APP_NAME || 'LocumLink',
          },
        },
      })

      if (error) {
        if (error.message.includes('rate limit')) {
          setMessage({ type: 'error', text: 'Too many requests. Please wait a few minutes before trying again.' })
        } else if (error.message.includes('invalid email')) {
          setMessage({ type: 'error', text: 'The email address provided is not valid.' })
        } else {
          setMessage({ type: 'error', text: error.message })
        }
        return
      }

      setMessage({
        type: 'success',
        text: `A verification code has been sent to ${email}. Please check your inbox and spam folder.`,
      })

      if (onOtpSent) onOtpSent(email)
    } catch (err) {
      console.error('OTP send error:', err)
      setMessage({ type: 'error', text: err?.message || 'Failed to send verification code. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .otp-page {
          min-height: 100vh;
          display: flex;
          font-family: 'DM Sans', sans-serif;
          background: #f0f4f9;
        }

        /* Left panel */
        .otp-left {
          width: 420px;
          flex-shrink: 0;
          background: #1a3a6b;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px 44px;
          position: relative;
          overflow: hidden;
        }

        .otp-left::before {
          content: '';
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          border: 60px solid rgba(255,255,255,0.05);
          bottom: -80px;
          left: -80px;
        }

        .otp-left::after {
          content: '';
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          border: 40px solid rgba(255,255,255,0.05);
          top: 60px;
          right: -60px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          z-index: 1;
        }

        .brand-logo {
          width: 40px;
          height: 40px;
          background: #4a90d9;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .brand-logo svg {
          width: 22px;
          height: 22px;
          fill: white;
        }

        .brand-name {
          font-family: 'DM Serif Display', serif;
          font-size: 22px;
          color: white;
          letter-spacing: 0.3px;
        }

        .otp-left-content {
          z-index: 1;
        }

        .otp-left-content h2 {
          font-family: 'DM Serif Display', serif;
          font-size: 32px;
          color: white;
          line-height: 1.3;
          margin-bottom: 16px;
        }

        .otp-left-content p {
          font-size: 14px;
          color: rgba(255,255,255,0.6);
          line-height: 1.7;
        }

        .feature-list {
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
        }

        .feature-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4a90d9;
          flex-shrink: 0;
        }

        /* Right panel */
        .otp-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 32px;
        }

        .otp-card {
          width: 100%;
          max-width: 420px;
        }

        .otp-card-header {
          margin-bottom: 36px;
        }

        .otp-card-header .step-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: #4a90d9;
          margin-bottom: 10px;
        }

        .otp-card-header h1 {
          font-family: 'DM Serif Display', serif;
          font-size: 30px;
          color: #0f1e3c;
          margin-bottom: 8px;
        }

        .otp-card-header p {
          font-size: 14px;
          color: #6b7a99;
          line-height: 1.6;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #374466;
          margin-bottom: 8px;
          letter-spacing: 0.2px;
        }

        .form-input {
          width: 100%;
          padding: 13px 16px;
          border: 1.5px solid #d5dded;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #0f1e3c;
          background: white;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .form-input::placeholder { color: #aab3cc; }

        .form-input:focus {
          border-color: #4a90d9;
          box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.12);
        }

        .form-input:disabled {
          background: #f5f7fb;
          color: #aab3cc;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 18px;
          line-height: 1.5;
        }

        .alert-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
        }

        .alert-success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .btn-primary {
          width: 100%;
          padding: 14px;
          background: #1a3a6b;
          color: white;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-primary:hover:not(:disabled) { background: #14305a; }
        .btn-primary:active:not(:disabled) { transform: scale(0.99); }
        .btn-primary:disabled { background: #9aaabf; cursor: not-allowed; }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-note {
          margin-top: 24px;
          text-align: center;
          font-size: 12px;
          color: #9aaabf;
          line-height: 1.6;
        }

        .auth-note a {
          color: #4a90d9;
          text-decoration: none;
        }

        @media (max-width: 768px) {
          .otp-left { display: none; }
          .otp-right { padding: 32px 20px; }
        }
      `}</style>

      <div className="otp-page">
        {/* Left decorative panel */}
        <div className="otp-left">
          <div className="brand">
            <div className="brand-logo">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            </div>
            <span className="brand-name">LocumLink</span>
          </div>

          <div className="otp-left-content">
            <h2>Secure Access to Your Account</h2>
            <p>We use one-time verification codes to keep your account safe — no passwords required.</p>
          </div>

          <div className="feature-list">
            <div className="feature-item"><span className="feature-dot" />No password to remember</div>
            <div className="feature-item"><span className="feature-dot" />Code expires in 5 minutes</div>
            <div className="feature-item"><span className="feature-dot" />Secure & encrypted access</div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="otp-right">
          <div className="otp-card">
            <div className="otp-card-header">
              <div className="step-label">Step 1 of 2</div>
              <h1>Sign In</h1>
              <p>Enter your email address and we'll send you a 6-digit verification code.</p>
            </div>

            <form onSubmit={handleSendOtp}>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="email"
                  className="form-input"
                />
              </div>

              {message.text && (
                <div className={`alert alert-${message.type}`}>
                  {message.text}
                </div>
              )}

              <button type="submit" disabled={loading || !email} className="btn-primary">
                {loading ? (
                  <><span className="spinner" /> Sending Code...</>
                ) : (
                  'Send Verification Code'
                )}
              </button>
            </form>

            <p className="auth-note">
              By continuing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}