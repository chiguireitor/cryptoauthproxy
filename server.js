/**
* Copyright (c) 2017 Chiguireitor
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in
* all copies or substantial portions of the Software.
*/
'use strict'
const express = require('express')

var app = express()

const expressWs = require('express-ws')(app)
const bitcoin = require('bitcoinjs-lib')
const bitcoinMessage = require('bitcoinjs-message')
const httpPort = process.env.HTTP_PORT || 80

var challenges = {}

var byAddress = {}

function verifySignatureAndRespond(challenge, signature, address) {
  let messagePrefix = bitcoin.networks.bitcoin.messagePrefix

  return bitcoinMessage.verify(challenge, messagePrefix, address, signature)
}

app.get('/', function (req, res) {
  /*
  address=[address]&signature=[url encoded signature]&challenge=asd
  */
  let ret = {}
  if (('address' in req.params) && ('signature' in req.params)) {
    if (req.params.address in byAddress) {
      let challenge = byAddress[req.params.address].challenge
      let socket = byAddress[req.params.address].ws

      if (verifySignatureAndRespond(challenge, req.params.signature, req.params.address)) {
        ret.success = true
        socket.send(JSON.stringify({
          verified: req.params.address,
          challenge
        }))
        delete byAddress[req.params.address]
      } else {
        ret.error = 'wrong-sig-addr'
      }
    } else if ('msg' in req.params) {
      if (req.params.msg in challenges) {
        let challenge = req.params.msg
        let socket = challenges[challenge].ws
        if (verifySignatureAndRespond(challenge, req.params.signature, req.params.address)) {
          ret.success = true
          socket.send(JSON.stringify({
            verified: req.params.address,
            challenge
          }))
          delete challenges[challenge]
        } else {
          ret.error = 'wrong-sig-addr'
        }
      } else {
        ret.error = 'invalid-challenge'
      }
    } else {
      ret.error = 'given-challenge-expected'
    }
  } else {
    ret.error = 'addr-sig-expected'
  }
  res.send(JSON.stringify(ret))
})

app.ws('/register', function(ws, req) {
  let addedChallenges = []
  let addedAddresses = []

  ws.on('message', function(msg) {
    try {
      var ob = JSON.parse(msg)

      if ('challenge' in ob) {
        challenges[ob.challenge] = {
          start: Date.now(),
          socket: ws
        }

        ws.send(JSON.stringify({
          ok: true
        }))
      } else {
        ws.send(JSON.stringify({
          invalid: true
        }))
      }
    } catch(e) {
      ws.send(JSON.stringify({
        error: e.toString()
      }))
    }
  })

  ws.on('close', function(msg) {
    for (let i=0; i < addedChallenges.length; i++) {
      if (addedChallenges[i] in challenges) {
        delete challenges[addedChallenges[i]]
      }
    }

    for (let i=0; i < addedAddresses.length; i++) {
      if (addedAddresses[i] in byAddress) {
        delete byAddress[addedAddresses[i]]
      }
    }
  })
})

app.listen(httpPort, function () {
  console.log('Proxy listening on port ' + httpPort)
})
