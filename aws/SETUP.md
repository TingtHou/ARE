# Turning on accounts (sign-in with email and password)

This takes about 10 minutes, all in the AWS Console. It creates:

- **Amazon Cognito**: sign-up, sign-in, email verification codes and password resets. Passwords are stored by AWS, never by the site.
- **API Gateway, Lambda and DynamoDB**: a small service that saves each person's progress, so it follows them to every device.

**Cost:** Cognito is free for the first 10,000 monthly users. The API and database cost fractions of a cent at study-group scale. It's still worth setting a $1 budget alert under Billing, then Budgets.

## 1. Create the stack

1. Sign in to the AWS Console. At the top right, pick the **region** you want, for example *US East (N. Virginia)*.
2. Open **CloudFormation**, then **Create stack**, then **With new resources (standard)**.
3. Choose **Upload a template file**, pick `aws/are-accounts.yaml` from this folder, and click **Next**.
   It's also on GitHub: TingtHou/ARE, then `aws`, then `are-accounts.yaml`, then **Download raw file**.
4. **Stack name:** `are-accounts`.
   **SiteOrigin:** your site's address with no slash at the end, for example `https://main.d27g401yt8k71l.amplifyapp.com`.
   Click **Next**.
5. Click **Next** on the options page. On the last page, tick **"I acknowledge that AWS CloudFormation might create IAM resources"**, then click **Submit**.
6. Wait for **CREATE_COMPLETE**, about 2 minutes.

## 2. Connect the site

1. Open the stack's **Outputs** tab. It lists four values: `Region`, `UserPoolId`, `UserPoolClientId` and `ApiUrl`.
2. Put them in `config.js` at the top of this folder, or paste them to Claude and it will do this for you:
   ```js
   window.ARE_AUTH = {
     region:     'us-east-1',
     userPoolId: 'us-east-1_XXXXXXXXX',
     clientId:   'xxxxxxxxxxxxxxxxxxxxxxxxxx',
     apiUrl:     'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com'
   };
   ```
   These values aren't secret. They identify your sign-in service, and every visitor's browser receives them.
3. Commit and push. Amplify redeploys, and the site opens on a **Sign in** screen.

## 3. First sign-in

1. Click **Create an account**, then enter your name, email and a password. The password needs 8 or more characters, including a lowercase letter and a number.
2. Enter the 6-digit code from the email. It comes from `no-reply@verificationemail.com` and may land in spam.
3. If this browser already has progress from before accounts, the site offers to bring it into your account.

Everyone else does the same: they create their own account, and nobody can see anyone else's progress.

## Good to know

- **Email limits:** by default Cognito sends up to about 50 emails a day. That's plenty for a study group. For more, connect Amazon SES under Cognito, then User pools, then Messaging.
- **Managing people:** go to Cognito, then User pools, then `are-study-system-users`, then Users. You can see who has signed up, disable someone or delete an account there.
- **Stopping sign-up by strangers:** under Cognito, then Sign-up, turn off self-registration, then add people yourself under Users.
- **The claude.ai link** is unaffected. It keeps using your claude.ai sign-in.
- **To remove everything:** delete the `are-accounts` stack. The progress table is kept on purpose. Delete `are-study-system-progress` in DynamoDB too if you want the data gone.
- **To switch accounts off again:** empty the four values in `config.js` and push. The site goes back to browser profiles.

# Preview site and the admin Publish button

Every change goes to the `develop` branch first and shows on a **preview site**. The live site (`main`) only changes when an admin clicks **Publish to live site** on the preview.

## 1. Add the preview site in Amplify
1. Open **AWS Amplify**, then your app (the one serving `main.d27g401yt8k71l.amplifyapp.com`).
2. Click **Add branch**, choose `develop`, then **Save and deploy**.
3. The preview appears at `https://develop.d27g401yt8k71l.amplifyapp.com` and updates on every push to `develop`.

## 2. Give the Publish button a GitHub token
1. Go to GitHub, then **Settings**, then **Developer settings**, then **Fine-grained tokens**, then **Generate new token**.
   - **Repository access:** only `TingtHou/ARE`.
   - **Permissions:** Repository permissions, then **Contents: Read and write**.
   - Copy the token. **Don't paste it into chat or commit it.**
2. In the AWS Console (region **US East (N. Virginia)**), open **Systems Manager**, then **Parameter Store**, then **Create parameter**.
   - **Name:** `/are-study-system/github-token`
   - **Type:** SecureString (keep the default key)
   - **Value:** the token
   - Click **Create parameter**.

## 3. Update the stack
1. Open **CloudFormation**, then **are-accounts**, then **Update**, then **Replace existing template**, and upload the new `aws/are-accounts.yaml`.
2. **SiteOrigins:** both addresses, comma-separated, no spaces or slashes at the end:
   `https://main.d27g401yt8k71l.amplifyapp.com,https://develop.d27g401yt8k71l.amplifyapp.com`
3. Leave the other parameters (GitHubRepo, LiveBranch, PreviewBranch, GitHubTokenParameter) at their defaults. Tick the IAM box, then **Submit**, and wait for **UPDATE_COMPLETE**.

## 4. Make yourself an admin
1. Open **Cognito**, then **User pools**, then `are-study-system-users`, then **Groups**, then `admin`, then **Add user to group**, and pick your account.
2. On the preview site, sign out and sign back in, so the new group is in your sign-in.
3. A **Publish to live site…** button appears in the yellow Preview banner. It lists the changes waiting and asks you to confirm before publishing.

Publishing only moves `main` forward to match `develop`. If `main` ever has a change that `develop` doesn't, it stops and says so instead of overwriting.

# The Claude connector

The connector lets each person use **their own Claude plan** with their study account. It runs on the same API as progress sync: one extra Lambda function, plus a catch-all route. At study-group scale it stays in the AWS free tier.

## 1. Update the stack
1. Open **CloudFormation** (region **US East (N. Virginia)**), then **are-accounts**, then **Update**, then **Replace existing template**, and upload the new `aws/are-accounts.yaml`. Take it from the `develop` branch until it is published.
2. Keep every parameter as it is. The two new ones have the right defaults:
   - **SiteUrl:** `https://main.d27g401yt8k71l.amplifyapp.com`. The connector reads the shared material from here.
   - **StudyTimeZone:** `America/Chicago`. This decides what "today" means for plan weeks and study days.
3. Tick the IAM box, then **Submit**, and wait for **UPDATE_COMPLETE**.
4. On the **Outputs** tab, copy **ConnectorUrl**. It looks like `https://igmnvwc8n8.execute-api.us-east-1.amazonaws.com/mcp`. The site already knows it, because it's the API address plus `/mcp`.

## 2. Add it to Claude (each person does this once)
1. In Claude, go to **Settings → Connectors → Add custom connector**.
2. **Name:** `ARE Study System`. **URL:** the ConnectorUrl. Leave the advanced settings empty.
3. Click **Add**, then **Connect**. A sign-in page opens: use the same email and password as the study website.
4. In a new chat, ask "What should I study today?". The first time Claude uses a tool, it may ask you to allow it.

## Good to know
- **What Claude can do:** read your progress and the material, record answers and flashcard ratings, add or remove *your own* cards, questions and points, tick plan tasks, and save or remove your own plan. It can't change the shared material or anyone else's data.
- **Sign-in:** Claude gets a one-hour access token and a 90-day refresh token for your account. Both are stored as fingerprints (hashes), never in plain form, and expire on their own. If you disable someone in Cognito, their connector stops working at its next refresh.
- **Disconnect:** remove the connector in Claude's settings.
- **The website and Claude at the same time:** both save to the same account. The website picks up Claude's changes when you switch back to its tab. If you answer questions on the website while Claude is also saving, the last save wins, so finish one before starting the other.
- **Material changes** on the live site reach the connector within 10 minutes.

# ChatGPT on the website

Each person can connect **their own ChatGPT plan**. Explanations, generated cards and questions, the personal plan and the chat panel then answer right on the website, streamed as they're written. There's no API key and no OpenAI billing: requests use the person's ChatGPT plan. That plan must be ChatGPT **Plus or Pro**.

This follows OpenAI's [ChatGPT plan usage for open-source apps](https://developers.openai.com/siwc/token-sharing-open-source), self-hosted route:
1. Each person signs in to ChatGPT once **on their own computer**, with `tools/chatgpt-signin.mjs`. OpenAI only returns this sign-in to `127.0.0.1`.
2. The script checks the result and hands the credentials to the `are-study-system-chatgpt` function.
3. The function keeps them encrypted, refreshes them, and sends questions to OpenAI's Responses API with that person's own access token.

OpenAI describes this route for open-source apps and personal projects. Paid or remotely hosted apps for the public need their waitlist. This site is open source (MIT) and used by two people, each with their own plan.

## 1. Update the stack
Same as for the connector: in **CloudFormation**, open **are-accounts**, then **Update**, then **Replace existing template**, and upload `aws/are-accounts.yaml` from `develop`. Keep the parameters as they are. The new **ChatGPTKeyParameter** has the right default. Tick the IAM box and submit.

It adds:
- the **are-study-system-chatgpt** function with its own **function URL**. A function URL is needed because the HTTP API can't stream. The website finds the URL by itself, so there's nothing to paste.
- an encryption key for stored ChatGPT credentials. The function creates it on first use as the SecureString parameter `/are-study-system/chatgpt-token-key`. Deleting that parameter disconnects everyone.

## 2. Connect (each person, once)
1. On the website, click **Connect AI** in the top bar, then **Continue with ChatGPT**.
2. On a Mac or Windows computer with [Node.js 18 or newer](https://nodejs.org/en/download):
   - download `chatgpt-signin.mjs` from the link in the dialog
   - copy the command shown, open a terminal in the download folder, and run it. It looks like `node chatgpt-signin.mjs https://….lambda-url.us-east-1.on.aws <code>`. The code works once, for 15 minutes.
3. Sign in to ChatGPT in the browser that opens, and allow using your ChatGPT plan.
4. The website notices within a few seconds and shows **Using ChatGPT plan**. After that it works on every device you sign in on, including your phone.

## What you need to configure
Nothing beyond the stack update:
- **OpenAI client ID:** none to request. Each sign-in registers its own client (`dynamic_agent_client`), and the backend stores the issued ID.
- **Permissions:** the script asks for `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, for the resource `https://api.openai.com/v1`. Questions are only sent if `chatgpt.tokens.use.direct` was granted.
- **Callback URL:** `http://127.0.0.1:<random port>/callback` on your own computer, opened by the script. There's no callback on Amplify.
- **Secrets:** none to create. The encryption key creates itself.

## Good to know
- **Expiry:** access tokens last 1 hour and refresh on their own. The refresh token lasts 30 days from its last use, so if nobody uses ChatGPT on the site for 30 days, connect again.
- **Usage limits:** reaching your plan's limit for this app shows a message with **Manage usage**, which opens https://chatgpt.com/settings/usage. You can also set a weekly cap for the app there.
- **Revoked access:** if you remove the app in ChatGPT, or the sign-in stops working, the site shows **Connect again**. **Disconnect** on the website revokes the sign-in and deletes the stored credentials.
- **Separate accounts:** each study account has its own ChatGPT connection, and one ChatGPT account can only be connected to one study account.
- **Recording answers:** the chat panel's ChatGPT answers see your study status, but can't record answers or change your material. Use Practice and Flashcards for that, or the Claude connector.
