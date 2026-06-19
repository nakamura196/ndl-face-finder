/*
 * IIIF Curation Viewer - Firebase authentication plugin
 * http://codh.rois.ac.jp/software/iiif-curation-viewer/
 *
 * Copyright 2017 Center for Open Data in the Humanities, Research Organization of Information and Systems
 * Released under the MIT license
 *
 * Core contributor: Jun HOMMA (@2SC1815J)
 */
var icvAuthFirebase = (function() {
    var firebaseConfig = {
        apiKey: 'AIzaSyA00OT_063jEMYlKlqo4NA-IHFq0W03kZE',
        authDomain: 'kunshujo-c.firebaseapp.com',
        projectId: 'kunshujo-c',
        storageBucket: 'kunshujo-c.firebasestorage.app',
        messagingSenderId: '63469743049',
        appId: '1:63469743049:web:be55201b9223b5e8a7d618'
    };
    var uiConfig = {
        signInFlow: 'popup',
        signInOptions: [
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            firebase.auth.FacebookAuthProvider.PROVIDER_ID,
            firebase.auth.TwitterAuthProvider.PROVIDER_ID,
            //firebase.auth.GithubAuthProvider.PROVIDER_ID,
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            //firebase.auth.PhoneAuthProvider.PROVIDER_ID
        ],
        tosUrl: ''
    };
    return ICVAuthFirebase(firebaseConfig, uiConfig);
})();