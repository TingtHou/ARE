/* =====================================================================
   ACCOUNTS — ARE Study System
   Paste the four Outputs of the "are-accounts" CloudFormation stack here
   (see aws/SETUP.md). While any value is empty, the site runs without
   sign-in and uses browser profiles instead.
   These values are not secrets: they identify your sign-in service, and
   every browser that opens the site receives them.
   ===================================================================== */
window.ARE_AUTH = {
  region:     'us-east-1',   // Region            e.g. 'us-east-1'
  userPoolId: 'us-east-1_9UkwSw0nu',   // UserPoolId        e.g. 'us-east-1_AbC123xyz'
  clientId:   '1jhr4p4el2msaaisgr118nfpq3',   // UserPoolClientId  e.g. '4h5j6k7l8m9n0p1q2r3s4t5u6v'
  apiUrl:     'https://igmnvwc8n8.execute-api.us-east-1.amazonaws.com'    // ApiUrl            e.g. 'https://abc123.execute-api.us-east-1.amazonaws.com'
};
