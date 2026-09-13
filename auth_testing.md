# Auth-Gated App Testing Playbook (Gridline)

Gridline has TWO sign-in paths that end in the SAME httpOnly cookie session:

1. Email + password — `POST /api/auth/login` (demo@gridline.app / gridline123)
2. Emergent-managed Google sign-in — button `google-signin-button` on `/login`
   redirects to `https://auth.emergentagent.com/?redirect={origin}/dashboard`,
   returns to `{origin}/dashboard#session_id=...`, and `src/pages/AuthCallback.tsx`
   posts that id to `POST /api/auth/google/session`, which exchanges it server-side and
   sets the cookie.

Cookie: `gl_session` (httpOnly, SameSite=None, Secure), collection `sessions`
({token, user_id, expires_at}); users live in `users` with a custom `id` (UUID), never `_id`.
Google OAuth cannot be driven by a test browser — seed a session row instead.

## Step 1: create a test user + session directly
```
mongosh --eval '
const dbx = db.getSiblingDB("app");
const userId = "test-user-" + Date.now();
const token = "test_session_" + Date.now();
dbx.users.insertOne({id: userId, email: "test.user."+Date.now()+"@example.com", name: "Test User",
  company: "", plan: "pro", role: "owner", theme: "readout", page_credits: 0,
  auth_provider: "google", created_at: new Date()});
dbx.sessions.insertOne({token: token, user_id: userId, provider: "google",
  created_at: new Date(), expires_at: new Date(Date.now()+7*24*3600*1000)});
dbx.settings.insertOne({user_id: userId, country: "United States", region: "Texas",
  tax_label: "Sales Tax", tax_rate: 6.25, currency: "USD", labor_rate: 58.0,
  company_name: "Test Flooring", company_email: "test@example.com",
  pdf_template: "contractor_clean", default_scope: "supply_install"});
print(token);'
```

## Step 2: backend check
```
curl -s -b "gl_session=<TOKEN>" https://<host>/api/auth/me
curl -s -b "gl_session=<TOKEN>" https://<host>/api/jobs
```

## Step 3: browser check
```
await page.context().addCookies([{ name: "gl_session", value: "<TOKEN>",
  domain: "<host>", path: "/", httpOnly: true, secure: true, sameSite: "None" }]);
await page.goto("https://<host>/dashboard");
```

## Checklist
- `/api/auth/me` returns the user (not 401)
- `/dashboard` renders without bouncing to `/login`
- Callback detection uses `useLocation().hash` (App.tsx), not `window.location.hash`
- `google-signin-button` links to auth.emergentagent.com with the CURRENT origin
- Clean up: `dbx.users.deleteMany({email: /test\.user\./}); dbx.sessions.deleteMany({token: /test_session/})`
