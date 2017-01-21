/*
 * Copyright 2017 W.M. Webberley & A.D. Preece (Cardiff University)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
'use strict';

const http = require('http');
const CENode = require('./CENode.js');
const CEModels = require('../models/index.js');

const POST_SENTENCES_ENDPOINT = '/sentences';
const GET_CARDS_ENDPOINT = '/cards';

function postSentences(node, request, response) {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    body = decodeURIComponent(body.replace('sentence=', '').replace(/\+/g, ' '));
    const sentences = body.split(/\\n|\n/);
    const responses = node.addSentences(sentences);
    response.write(responses.map(resp => resp.data).join('\n'));
    response.end();
  });
}

function getCards(node, request, response, ignoresInput) {
  const url = decodeURIComponent(request.url);
  const agentRegex = url.match(/agent=(.*)/);
  const ignores = ignoresInput || [];
  let agentStr = null;
  let agents = [];
  if (agentRegex) { agentStr = agentRegex[1]; }
  if (agentStr) {
    agents = agentStr.toLowerCase().split(',');
  }
  const cards = node.getInstances('card', true);
  let s = '';
  for (let i = 0; i < cards.length; i += 1) {
    if (ignores.indexOf(cards[i].name) === -1) {
      if (!agents || agents.length === 0) {
        s += `${cards[i].ce}\n`;
      } else {
        const tos = cards[i].is_tos;
        if (tos) {
          for (let j = 0; j < tos.length; j += 1) {
            for (let k = 0; k < agents.length; k += 1) {
              if (tos[j].name.toLowerCase() === agents[k]) {
                s += `${cards[i].ce}\n`;
                break;
              }
            }
          }
        }
      }
    }
  }
  response.write(s);
  response.end();
}

function startServer() {
  const node = new CENode(CEModels.core, CEModels.server);
  node.attachAgent();
  let port = 5555;
  if (process.argv.length > 3) {
    port = process.argv[3];
  }
  if (process.argv.length > 2) {
    node.agent.setName(process.argv[2]);
  }

  http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');

    if (request.method === 'GET') {
      if (request.url === '/') {
        const ins = node.instances;
        const con = node.concepts;
        let s = '<html><head><title>CENode Management</title></head><body><h1>CENode Server Admin Interface</h1>';
        s += '<div style="width:48%;float:left;"><h2>Conceptual model</h2>';
        s += '<p>Add CE sentences to the node:</p><form action="/ui/sentences" enctype="application/x-www-form-urlencoded" method="POST"><textarea name="sentence" style="width:95%;height:100px;"></textarea><br /><br /><input type="submit" /></form></div>';
        s += `<div style="width:48%;float:left;"><h2>Node settings</h2><p>Update local agent name:</p><form method="POST" action="/agent-name"><input type="text" name="name" value="${node.agent.name}" /><input type="submit" /></form>`;
        s += '<p>Other options:</p><button onclick="window.location=\'/reset\';">Empty model</button>';
        s += '</div><div style="clear:both;"></div>';
        s += '<div style="display:inline-block;width:45%;float:left;"><h2>Concepts</h2>';
        for (const concept of con) {
          s += concept.name;
          if (concept.parents.length) {
            s += ` (${concept.parents[0].name})`;
          }
          s += '<br>';
        }
        s += '</div><div style="display:inline-block;width:45%;float:right;"><h2>Instances</h2>';
        for (const instance of ins) {
          s += `${instance.name} (${instance.type.name})<br>`;
        }
        s += '</div><body></html>';
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(s);
      } else if (request.url.indexOf(GET_CARDS_ENDPOINT) === 0) {
        response.writeHead(200, { 'Content-Type': 'text/ce' });
        getCards(node, request, response);
      } else if (request.url === '/reset') {
        node.resetAll();
        response.writeHead(302, { Location: '/' });
        response.end();
      } else {
        response.writeHead(404);
        response.end('404: Resource not found for method GET.');
      }
    } else if (request.method === 'POST') {
      if (request.url.indexOf(GET_CARDS_ENDPOINT) === 0) {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          const ignores = body.split(/\\n|\n/);
          response.writeHead(200, { 'Content-Type': 'text/ce' });
          getCards(node, request, response, ignores);
        });
      } else if (request.url === POST_SENTENCES_ENDPOINT) {
        response.writeHead(200, { 'Content-Type': 'text/ce' });
        postSentences(node, request, response);
      } else if (request.url === '/ui/sentences') {
        response.writeHead(302, { Location: '/' });
        postSentences(node, request, response);
      } else if (request.url === '/agent-name') {
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', () => {
          body = decodeURIComponent(body.replace('name=', '').replace(/\+/g, ' '));
          node.agent.setName(body);
          response.writeHead(302, { Location: '/' });
          response.end();
        });
      } else {
        response.writeHead(404);
        response.end('404: Resource not found for method POST.');
      }
    } else {
      response.writeHead(405);
      response.end('405: Method not allowed on this server.');
    }
  }).listen(port || 5555);
}

if (require.main === module) {
  startServer();
}
