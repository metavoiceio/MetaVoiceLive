const functions = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const crypto = require('crypto');
// TODO sidroopdaska: Remove secret from codebase. Fetch from secure GCP key-vault
const INTERCOM_SECRET = 'c-hBGG0bK5P-9LGnF0_Bmp2RahRW_7sguhGPG4wx';

initializeApp();
const db = getFirestore();

exports.tracking = functions.https.onRequest((request, response) => {
  if (request.method === 'POST') {
    const docRef = db.doc(request.body['path']);
    const data = request.body['data'];

    docRef.set(data).then((a) => {
      functions.logger.info('success');
      response.send('Success!');
    }).catch((err) => {
      functions.logger.info(request.body);
      functions.logger.info('failure');
      functions.logger.info(err);
      response.send('failure - error!');
    });
  } else {
    functions.logger.info('unexpected request');
    response.send('unexpected request!');
  }
});

exports.getIntercomUserHash = functions.https.onRequest((request, response) => {
  if (request.method !== 'GET') {
    functions.logger.info(`Bad request. Received a ${request.method} from client.`);
    response.status == 400; // bad request
    return response;
  }

  if (request.method === 'GET' && !request.query.email) {
    functions.logger.info('Bad request. Missing query param: `email` from GET request.');
    response.status == 400; // bad request
    return response;
  }

  try {
    const email = request.query.email;
    functions.logger.info(`email=${email}`);

    const hmac = crypto.createHmac('sha256', INTERCOM_SECRET);
    hmac.update(email);
    const userHash = hmac.digest('hex');

    functions.logger.info(`userhash=${userHash}`);
    response.json({ userHash });
  } catch (error) {
    functions.logger.error(`Interal server error: ${error}`);
    response.status = 500;
  }
});
