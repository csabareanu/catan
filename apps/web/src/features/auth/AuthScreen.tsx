import { useState, type FormEvent } from 'react'
import { ApiError, type ApiErrorFields } from '../../lib/apiClient'
import { navigateTo } from '../../lib/navigation'
import { writeSessionToken } from '../../lib/browserSession'
import {
  loginUser,
  registerUser,
  type AuthenticatedUser,
} from './authApi'
import { AccessShell } from './AuthShell'

type AuthenticationMode = 'login' | 'register'

type AuthenticationScreenProps = {
  mode: AuthenticationMode
  onAuthenticated: (user: AuthenticatedUser) => void
}
type FormValues = {
  name: string
  email: string
  password: string
  passwordConfirmation: string
}

type FormError = {
  message: string
  fields: ApiErrorFields
}

const initialFormValues: FormValues = {
  name: '',
  email: '',
  password: '',
  passwordConfirmation: '',
}

export function AuthenticationScreen({
  mode,
  onAuthenticated,
}: AuthenticationScreenProps) {
  const isRegisterMode = mode === 'register'
  const [values, setValues] = useState<FormValues>(initialFormValues)
  const [formError, setFormError] = useState<FormError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateValue = (field: keyof FormValues, value: string) => {
    setValues((currentValues) => ({ ...currentValues, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setFormError(null)

    try {
      const response = isRegisterMode
        ? await registerUser({
            name: values.name,
            email: values.email,
            password: values.password,
            password_confirmation: values.passwordConfirmation,
            token_name: 'catan-web',
          })
        : await loginUser({
            email: values.email,
            password: values.password,
            token_name: 'catan-web',
          })

      writeSessionToken(response.data.token)
      onAuthenticated(response.data.user)
      navigateTo('/games')
    } catch (caught: unknown) {
      setFormError(toFormError(caught))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldError = (field: keyof FormValues): string | undefined => {
    const apiField = field === 'passwordConfirmation' ? 'password_confirmation' : field

    return formError?.fields[apiField]?.[0]
  }

  return (
    <AccessShell>
      <p className="eyebrow">Account access</p>
      <h1>{isRegisterMode ? 'Create your account.' : 'Sign in to Catan.'}</h1>
      <p className="access-description">
        {isRegisterMode
          ? 'Create an account to start games and access your private game history.'
          : 'Sign in to continue to your private games.'}
      </p>

      <form className="access-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="access-error" role="alert">
            {formError.message}
          </p>
        )}

        {isRegisterMode && (
          <label className="access-field">
            <span>Name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              value={values.name}
              onChange={(event) => updateValue('name', event.target.value)}
              aria-invalid={fieldError('name') !== undefined}
              aria-describedby={fieldError('name') ? 'name-error' : undefined}
              required
            />
            {fieldError('name') && (
              <span className="access-field-error" id="name-error">
                {fieldError('name')}
              </span>
            )}
          </label>
        )}

        <label className="access-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => updateValue('email', event.target.value)}
            aria-invalid={fieldError('email') !== undefined}
            aria-describedby={fieldError('email') ? 'email-error' : undefined}
            required
          />
          {fieldError('email') && (
            <span className="access-field-error" id="email-error">
              {fieldError('email')}
            </span>
          )}
        </label>

        <label className="access-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
            value={values.password}
            onChange={(event) => updateValue('password', event.target.value)}
            aria-invalid={fieldError('password') !== undefined}
            aria-describedby={fieldError('password') ? 'password-error' : undefined}
            required
          />
          {fieldError('password') && (
            <span className="access-field-error" id="password-error">
              {fieldError('password')}
            </span>
          )}
        </label>

        {isRegisterMode && (
          <label className="access-field">
            <span>Confirm password</span>
            <input
              name="password_confirmation"
              type="password"
              autoComplete="new-password"
              value={values.passwordConfirmation}
              onChange={(event) => updateValue('passwordConfirmation', event.target.value)}
              aria-invalid={fieldError('passwordConfirmation') !== undefined}
              aria-describedby={
                fieldError('passwordConfirmation')
                  ? 'password-confirmation-error'
                  : undefined
              }
              required
            />
            {fieldError('passwordConfirmation') && (
              <span className="access-field-error" id="password-confirmation-error">
                {fieldError('passwordConfirmation')}
              </span>
            )}
          </label>
        )}

        <button className="access-primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isRegisterMode
              ? 'Creating account…'
              : 'Signing in…'
            : isRegisterMode
              ? 'Create account'
              : 'Sign in'}
        </button>
      </form>

      <div className="access-links">
        <a href={isRegisterMode ? '/login' : '/register'}>
          {isRegisterMode ? 'Already have an account? Sign in' : 'Need an account? Create one'}
        </a>
        <a href="/">Return to board preview</a>
      </div>
    </AccessShell>
  )
}

function toFormError(caught: unknown): FormError {
  if (caught instanceof ApiError) {
    return {
      message: caught.message,
      fields: caught.fields ?? {},
    }
  }

  return {
    message: 'The request could not be completed. Please try again.',
    fields: {},
  }
}
