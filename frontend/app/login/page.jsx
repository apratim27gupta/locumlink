// app/login/page.jsx
// =============================================
// Main Auth Page — RequestOtp + VerifyOtp combine karta hai
// =============================================

'use client'

import { useState } from 'react'
import RequestOtp from '@/components/Auth/RequestOtp'
import VerifyOtp from '@/components/Auth/VerifyOtp'

export default function LoginPage() {
  const [step, setStep] = useState('request') // 'request' | 'verify'
  const [email, setEmail] = useState('')

  const handleOtpSent = (userEmail) => {
    setEmail(userEmail)
    setStep('verify')
  }

  const handleBack = () => {
    setStep('request')
    setEmail('')
  }

  return (
    <>
      {step === 'request' && (
        <RequestOtp onOtpSent={handleOtpSent} />
      )}
      {step === 'verify' && (
        <VerifyOtp email={email} onBack={handleBack} />
      )}
    </>
  )
}
