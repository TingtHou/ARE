/* =====================================================================
   ACCOUNTS — ARE Study System
   Paste the four Outputs of the "are-accounts" CloudFormation stack here
   (see aws/SETUP.md). While any value is empty, the site runs without
   sign-in and uses browser profiles instead.
   These values are not secrets: they identify your sign-in service, and
   every browser that opens the site receives them.
   ===================================================================== */
window.ARE_AUTH = {
  region:     '',   // Region            e.g. 'us-east-1'
  userPoolId: '',   // UserPoolId        e.g. 'us-east-1_AbC123xyz'
  clientId:   '',   // UserPoolClientId  e.g. '4h5j6k7l8m9n0p1q2r3s4t5u6v'
  apiUrl:     ''    // ApiUrl            e.g. 'https://abc123.execute-api.us-east-1.amazonaws.com'
};
