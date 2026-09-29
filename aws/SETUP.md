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
