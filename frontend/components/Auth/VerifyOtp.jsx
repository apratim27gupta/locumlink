'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function VerifyOtp({ email, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [resendTimer, setResendTimer] = useState(60)
  const [canResend, setCanResend] = useState(false)
  const inputRefs = useRef([])
  const router = useRouter()

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [resendTimer])

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    if (newOtp.every((d) => d !== '') && newOtp.join('').length === 6) {
      verifyOtp(newOtp.join(''))
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('')
      setOtp(newOtp)
      inputRefs.current[5]?.focus()
      verifyOtp(pastedData)
    }
  }

  const verifyOtp = async (otpCode) => {
    const code = otpCode || otp.join('')
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Please enter the complete 6-digit verification code.' })
      return
    }

    setLoading(true)
    setMessage({ type: '', text: '' })

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: code,
        type: 'email',
      })

      if (error) {
        if (error.message.includes('expired') || error.message.includes('Token has expired')) {
          setMessage({ type: 'error', text: 'This code has expired. Please request a new one.' })
        } else if (
          error.message.includes('invalid') ||
          error.message.includes('Invalid') ||
          error.message.includes('not found') ||
          error.message.includes('otp')
        ) {
          setMessage({ type: 'error', text: 'Incorrect code. Please check and try again.' })
          setOtp(['', '', '', '', '', ''])
          inputRefs.current[0]?.focus()
        } else {
          setMessage({ type: 'error', text: `Verification failed: ${error.message}` })
          setOtp(['', '', '', '', '', ''])
          inputRefs.current[0]?.focus()
        }
        return
      }

      setMessage({ type: 'success', text: 'Verification successful. Redirecting you now...' })

      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1000)

    } catch (err) {
      console.error('OTP verify error:', err)
      setMessage({ type: 'error', text: err?.message || 'Verification failed. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!canResend) return
    setLoading(true)
    setMessage({ type: '', text: '' })

    const { error } = await supabase.auth.signInWithOtp({
      email: email,
      options: { shouldCreateUser: true },
    })

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: `Failed to resend: ${error.message}` })
    } else {
      setMessage({ type: 'success', text: 'A new verification code has been sent to your email.' })
      setResendTimer(60)
      setCanResend(false)
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
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

        /* Left panel — same as RequestOtp */
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

        .step-label {
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

        .otp-card-header p strong {
          color: #1a3a6b;
          font-weight: 500;
        }

        /* 6-digit OTP boxes */
        .otp-inputs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
        }

        .otp-box {
          width: 44px;
          height: 44px;
          text-align: center;
          font-family: 'DM Sans', sans-serif;
          font-size: 18px;
          font-weight: 600;
          color: #0f1e3c;
          background: white;
          border: 1.5px solid #d5dded;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          caret-color: #4a90d9;
          flex: none;
        }

        .otp-box:focus {
          border-color: #4a90d9;
          box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.12);
        }

        .otp-box.filled {
          border-color: #1a3a6b;
          background: #f0f4f9;
        }

        .otp-box:disabled {
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
          margin-bottom: 20px;
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

        .auth-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 4px;
        }

        .btn-link {
          background: none;
          border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          color: #4a90d9;
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
          text-decoration: none;
        }

        .btn-link:hover:not(:disabled) { color: #1a3a6b; text-decoration: underline; }
        .btn-link:disabled { color: #aab3cc; cursor: not-allowed; }

        .resend-timer {
          font-size: 13px;
          color: #9aaabf;
        }

        @media (max-width: 768px) {
          .otp-left { display: none; }
          .otp-right { padding: 32px 20px; }
          .otp-box { width: 38px; height: 38px; font-size: 16px; }
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
            <h2>Almost There</h2>
            <p>Enter the 6-digit code we sent to your email to complete sign-in.</p>
          </div>

          <div className="feature-list">
            <div className="feature-item"><span className="feature-dot" />Code is valid for 5 minutes</div>
            <div className="feature-item"><span className="feature-dot" />Check your spam folder if needed</div>
            <div className="feature-item"><span className="feature-dot" />You can request a new code after 60s</div>
          </div>
        </div>

        {/* Right form panel */}
        <div className="otp-right">
          <div className="otp-card">
            <div className="otp-card-header">
              <div className="step-label">Step 2 of 2</div>
              <h1>Enter Verification Code</h1>
              <p>
                A 6-digit code was sent to <strong>{email}</strong>. Enter it below to sign in.
              </p>
            </div>

            {/* 6 individual digit boxes */}
            <div className="otp-inputs" onPaste={handlePaste}>
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  disabled={loading}
                  className={`otp-box ${digit ? 'filled' : ''}`}
                  autoFocus={index === 0}
                />
              ))}
            </div>

            {message.text && (
              <div className={`alert alert-${message.type}`}>
                {message.text}
              </div>
            )}

            <button
              onClick={() => verifyOtp()}
              disabled={loading || otp.join('').length !== 6}
              className="btn-primary"
            >
              {loading ? (
                <><span className="spinner" /> Verifying...</>
              ) : (
                'Verify & Sign In'
              )}
            </button>

            <div className="auth-actions">
              {canResend ? (
                <button onClick={handleResend} disabled={loading} className="btn-link">
                  Resend verification code
                </button>
              ) : (
                <span className="resend-timer">Resend available in {resendTimer}s</span>
              )}

              <button onClick={onBack} className="btn-link" disabled={loading}>
                ← Change email
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}