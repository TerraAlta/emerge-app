# Supabase Auth Email Templates for Emerge

Go to: https://supabase.com/dashboard/project/jxkbblstaqstwutmrdaf/auth/templates

## 1. Confirm Signup

**Subject:** Welcome to Emerge — confirm your email

**Body:**
```html
<div style="max-width:420px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0D1A0B;border-radius:16px;overflow:hidden;border:1px solid rgba(200,145,58,0.15);">
  <div style="padding:32px 28px 24px;text-align:center;">
    <div style="font-size:28px;font-weight:300;color:#E8F2E0;letter-spacing:-0.01em;">
      em<span style="color:#C8913A;">e</span>rge
    </div>
    <p style="font-size:11px;color:rgba(232,242,224,0.45);letter-spacing:0.12em;text-transform:uppercase;margin-top:8px;">
      Real quests · Real community · Real change
    </p>
  </div>
  <div style="padding:0 28px 32px;">
    <h2 style="font-size:18px;font-weight:400;color:#E8F2E0;margin:0 0 12px;">Welcome to the community</h2>
    <p style="font-size:14px;color:rgba(232,242,224,0.65);line-height:1.6;margin:0 0 24px;">
      You're one step away from discovering regenerative quests near you. Confirm your email to get started.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 28px;background:#C8913A;color:#0D1A0B;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
      Confirm my email
    </a>
    <p style="font-size:11px;color:rgba(232,242,224,0.3);margin-top:24px;line-height:1.5;">
      If you didn't create an Emerge account, you can safely ignore this email.
    </p>
  </div>
</div>
```

## 2. Reset Password

**Subject:** Reset your Emerge password

**Body:**
```html
<div style="max-width:420px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0D1A0B;border-radius:16px;overflow:hidden;border:1px solid rgba(200,145,58,0.15);">
  <div style="padding:32px 28px 24px;text-align:center;">
    <div style="font-size:28px;font-weight:300;color:#E8F2E0;letter-spacing:-0.01em;">
      em<span style="color:#C8913A;">e</span>rge
    </div>
    <p style="font-size:11px;color:rgba(232,242,224,0.45);letter-spacing:0.12em;text-transform:uppercase;margin-top:8px;">
      Real quests · Real community · Real change
    </p>
  </div>
  <div style="padding:0 28px 32px;">
    <h2 style="font-size:18px;font-weight:400;color:#E8F2E0;margin:0 0 12px;">Reset your password</h2>
    <p style="font-size:14px;color:rgba(232,242,224,0.65);line-height:1.6;margin:0 0 24px;">
      Someone requested a password reset for your Emerge account. Click below to choose a new password.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 28px;background:#C8913A;color:#0D1A0B;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
      Reset password
    </a>
    <p style="font-size:11px;color:rgba(232,242,224,0.3);margin-top:24px;line-height:1.5;">
      If you didn't request this, you can safely ignore this email. Your password won't change.
    </p>
  </div>
</div>
```

## 3. Magic Link

**Subject:** Your Emerge login link

**Body:**
```html
<div style="max-width:420px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0D1A0B;border-radius:16px;overflow:hidden;border:1px solid rgba(200,145,58,0.15);">
  <div style="padding:32px 28px 24px;text-align:center;">
    <div style="font-size:28px;font-weight:300;color:#E8F2E0;letter-spacing:-0.01em;">
      em<span style="color:#C8913A;">e</span>rge
    </div>
    <p style="font-size:11px;color:rgba(232,242,224,0.45);letter-spacing:0.12em;text-transform:uppercase;margin-top:8px;">
      Real quests · Real community · Real change
    </p>
  </div>
  <div style="padding:0 28px 32px;">
    <h2 style="font-size:18px;font-weight:400;color:#E8F2E0;margin:0 0 12px;">Your login link</h2>
    <p style="font-size:14px;color:rgba(232,242,224,0.65);line-height:1.6;margin:0 0 24px;">
      Click below to log in to Emerge. This link expires in 1 hour.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 28px;background:#C8913A;color:#0D1A0B;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
      Log in to Emerge
    </a>
    <p style="font-size:11px;color:rgba(232,242,224,0.3);margin-top:24px;line-height:1.5;">
      If you didn't request this link, you can safely ignore this email.
    </p>
  </div>
</div>
```

## 4. Change Email

**Subject:** Confirm your new Emerge email

**Body:**
```html
<div style="max-width:420px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0D1A0B;border-radius:16px;overflow:hidden;border:1px solid rgba(200,145,58,0.15);">
  <div style="padding:32px 28px 24px;text-align:center;">
    <div style="font-size:28px;font-weight:300;color:#E8F2E0;letter-spacing:-0.01em;">
      em<span style="color:#C8913A;">e</span>rge
    </div>
    <p style="font-size:11px;color:rgba(232,242,224,0.45);letter-spacing:0.12em;text-transform:uppercase;margin-top:8px;">
      Real quests · Real community · Real change
    </p>
  </div>
  <div style="padding:0 28px 32px;">
    <h2 style="font-size:18px;font-weight:400;color:#E8F2E0;margin:0 0 12px;">Confirm your new email</h2>
    <p style="font-size:14px;color:rgba(232,242,224,0.65);line-height:1.6;margin:0 0 24px;">
      Click below to confirm changing your Emerge email address.
    </p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 28px;background:#C8913A;color:#0D1A0B;font-size:14px;font-weight:600;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">
      Confirm new email
    </a>
    <p style="font-size:11px;color:rgba(232,242,224,0.3);margin-top:24px;line-height:1.5;">
      If you didn't request this change, please secure your account immediately.
    </p>
  </div>
</div>
```

## Supabase Auth Settings

Also update these in **Authentication → Settings**:

1. **Site URL:** `https://emerge.terralta.org` (once DNS is live)
2. **Redirect URLs:** Add `https://emerge.terralta.org/**` and `https://emerge-app-indol.vercel.app/**`
3. **Sender name:** `Emerge`
4. **Sender email:** Keep as default Supabase sender for now, or set up custom SMTP later

## Custom SMTP (optional, for pro look)

To send emails from `hello@terralta.org` instead of Supabase's default:
1. Go to **Project Settings → Auth → SMTP Settings**
2. Enable custom SMTP
3. Use your email provider's SMTP credentials (Gmail, Proton, etc.)
