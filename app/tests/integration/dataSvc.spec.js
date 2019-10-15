const helper = require('../common/helper');
const Knex = require('knex');
const uuidv4 = require('uuid/v4');

const DataConnection = require('../../src/services/dataConn');
const DataService = require('../../src/services/dataSvc');

helper.logHelper();

const config = require('../../knexfile');

const emails = [
  {
    'attachments': [],
    'bcc': [],
    'bodyType': 'html',
    'body': 'first sample email',
    'cc': [],
    'encoding': 'utf-8',
    'from': 'mitch connors <mitchymitch@mitchconnors.org>',
    'priority': 'normal',
    'to': ['doctor@krieger.org', 'Joey Joe-Joe Jr <joeyjoejoejr@shabadoo.org>'],
    'subject': 'Hello user',
    'tag': 'a tag value',
    'delayTS': 1570000000000
  }, {
    'attachments': [],
    'bcc': [],
    'bodyType': 'text',
    'body': 'second sample email',
    'cc': [],
    'encoding': 'utf-8',
    'from': 'willienelson@willieandthefaily.org',
    'priority': 'normal',
    'to': ['waylon@waylonjenningsss.org'],
    'subject': 'Hello Walls',
    'tag': 'business key',
    'delayTS': 1570000000000
  }];

function expectNewMessage (trxnId, msgId, msg, email) {
  expect(msg.transactionId).toMatch(trxnId);
  expect(msg.messageId).toMatch(msgId);
  expect(msg.status).toMatch('accepted');
  expect(msg.createdAt).toBeTruthy();
  expect(msg.updatedAt).toBeTruthy();
  expect(msg.statusHistory).toHaveLength(1);
  expect(msg.statusHistory[0].messageId).toMatch(msg.messageId);
  expect(msg.statusHistory[0].status).toMatch('accepted');
  expect(msg.statusHistory[0].createdAt).toBeTruthy();
  expect(msg.statusHistory[0].updatedAt).toBeFalsy();
  expect(msg.content).toBeTruthy();
  expect(msg.content.createdAt).toBeTruthy();
  expect(msg.content.updatedAt).toBeTruthy();
  if (email) {
    expect(msg.delayTimestamp.toString()).toEqual(email.delayTS.toString());
    expect(msg.tag).toMatch(email.tag);
    expect(msg.content.email.to).toEqual(email.to);
  }
}

describe('dataservice', () => {
  let knex;
  let dataService;
  const CLIENT = `unittesting-${new Date().toISOString()}`;
  
  beforeAll(async () => {
    knex = Knex(config);
    await knex.migrate.latest();
    const dataConnection = new DataConnection();
    const connectOK = await dataConnection.checkConnection();
    if (!connectOK) {
      throw Error('Error initializing dataService');
    }
    dataService = new DataService();
  });
  
  afterAll(async () => {
    await dataService.deleteTransactionsByClient(CLIENT);
    return knex.destroy();
  });
  
  it('should return false on initializing data service without knex', async () => {
    const dataConnection = new DataConnection();
    dataConnection.configuration = undefined;
    const connectOK = await dataConnection.checkConnection();
    expect(connectOK).toBeFalsy();
  });
  
  it('should error creating a transaction without client', async () => {
    const email = emails[0];
    
    await expect(dataService.create(undefined, email)).rejects.toThrow();
  });
  
  it('should error creating a transaction without email messages', async () => {
    const email = undefined;
    
    await expect(dataService.create(CLIENT, email)).rejects.toThrow();
  });
  
  it('should create a trxn for single email', async () => {
    const email = emails[0];
    const result = await dataService.create(CLIENT, email);
    expect(result).toBeTruthy();
    expect(result.transactionId).toBeTruthy();
    expect(result.client).toMatch(CLIENT);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(result.messages).toBeTruthy();
    expect(result.messages).toHaveLength(1);
    
    expectNewMessage(result.transactionId, result.messages[0].messageId, result.messages[0], email);
    
  });
  
  it('should create a trxn for email array', async () => {
    const compare = (a1, a2) =>
      (a1 = new Set(a1)) &&
      (a2 = new Set(a2)) &&
      a1.size === a2.size &&
      [...a1].every(v => a2.has(v));
    
    const result = await dataService.create(CLIENT, emails);
    expect(result).toBeTruthy();
    expect(result.transactionId).toBeTruthy();
    expect(result.client).toMatch(CLIENT);
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(result.messages).toBeTruthy();
    expect(result.messages).toHaveLength(emails.length);
    
    emails.forEach((email, i) => {
      let matchedEmail = false;
      expectNewMessage(result.transactionId, result.messages[i].messageId, result.messages[i]);
      // can't be sure that the order of email processing is sequential
      result.messages.forEach(m => {
        if (m.tag === email.tag && compare(m.content.email.to, email.to) && m.delayTimestamp.toString() === email.delayTS.toString()) {
          matchedEmail = true;
        }
      });
      expect(matchedEmail).toBeTruthy();
    });
  });
  
  it('should update a status and queue history', async () => {
    const email = emails[0];
    const queueId = uuidv4();
    const status = 'in the queue';
    const result = await dataService.create(CLIENT, email);
    expect(result).toBeTruthy();
    
    const msg = await dataService.updateStatus(result.messages[0].messageId, queueId, status);
    
    expect(msg.messageId).toMatch(result.messages[0].messageId);
    expect(msg.status).toMatch(status);
    expect(msg.statusHistory).toHaveLength(2);
    expect(msg.statusHistory[0].status).toMatch(status);
    expect(msg.queueHistory).toHaveLength(1);
    expect(msg.queueHistory[0].messageId).toMatch(msg.messageId);
    expect(msg.queueHistory[0].externalQueueId).toMatch(queueId);
    expect(msg.queueHistory[0].status).toMatch(status);
    
    // use the same status, should only add to queue history...
    const msg2 = await dataService.updateStatus(msg.messageId, queueId, status);
    expect(msg2.messageId).toMatch(msg.messageId);
    expect(msg2.status).toMatch(msg.status);
    expect(msg2.statusHistory).toHaveLength(2);
    // status history should come back in descending created order (last in, first out)
    expect(msg2.statusHistory[0].status).toMatch(status);
    expect(msg2.statusHistory[1].status).toMatch('accepted');
    expect(msg2.queueHistory).toHaveLength(2);
    // queue history should come back in descending created order (last in, first out)
    expect(msg2.queueHistory[0].messageId).toMatch(msg.messageId);
    expect(msg2.queueHistory[0].externalQueueId).toMatch(queueId);
    expect(msg2.queueHistory[0].status).toMatch(status);
    expect(msg2.queueHistory[1].messageId).toMatch(msg.messageId);
    expect(msg2.queueHistory[1].externalQueueId).toMatch(queueId);
    expect(msg2.queueHistory[1].status).toMatch(status);
    
    // use a new status, should add to status history too...
    const newStatus = 'this is new!';
    const msg3 = await dataService.updateStatus(msg.messageId, queueId, newStatus);
    expect(msg3.messageId).toMatch(msg.messageId);
    expect(msg3.status).toMatch(newStatus);
    expect(msg3.statusHistory).toHaveLength(3);
    // status history should come back in descending created order (last in, first out)
    expect(msg3.statusHistory[0].status).toMatch(newStatus);
    expect(msg3.statusHistory[1].status).toMatch(status);
    expect(msg3.statusHistory[2].status).toMatch('accepted');
    expect(msg3.queueHistory).toHaveLength(3);
    // queue history should come back in descending created order (last in, first out)
    expect(msg3.queueHistory[0].messageId).toMatch(msg.messageId);
    expect(msg3.queueHistory[0].externalQueueId).toMatch(queueId);
    expect(msg3.queueHistory[0].status).toMatch(newStatus);
    expect(msg3.queueHistory[1].messageId).toMatch(msg.messageId);
    expect(msg3.queueHistory[1].externalQueueId).toMatch(queueId);
    expect(msg3.queueHistory[1].status).toMatch(status);
    expect(msg3.queueHistory[2].messageId).toMatch(msg.messageId);
    expect(msg3.queueHistory[2].externalQueueId).toMatch(queueId);
    expect(msg3.queueHistory[2].status).toMatch(status);
    
  });
  
  it('should error out on status update with bad message id', async () => {
    
    const messageId = uuidv4();
    const queueId = uuidv4();
    const status = 'there is no message';
    
    await expect(dataService.updateStatus(messageId, queueId, status)).rejects.toThrow();
  });
  
  it('should error out on find transaction with bad id', async () => {
    const transactionId = uuidv4();
    await expect(dataService.readTransaction(transactionId)).rejects.toThrow();
  });
  
  it('should return a full transaction with valid id.', async () => {
    const email = emails[0];
    const result = await dataService.create(CLIENT, email);
    expect(result).toBeTruthy();
    
    const transactionId = result.transactionId;
    
    const transact = await dataService.readTransaction(transactionId);
    expect(transact).toBeTruthy();
    expect(transact.transactionId).toMatch(transactionId);
    expect(transact.client).toMatch(CLIENT);
    expect(transact.createdAt).toBeTruthy();
    expect(transact.updatedAt).toBeTruthy();
    expect(transact.messages).toBeTruthy();
    expect(transact.messages).toHaveLength(1);
    
    expectNewMessage(transact.transactionId, transact.messages[0].messageId, transact.messages[0], email);
  });
  
  it('should error out on find message with bad id', async () => {
    const messageId = uuidv4();
    await expect(dataService.readMessage(messageId)).rejects.toThrow();
  });
  
  it('should return a full message with valid id.', async () => {
    const email = emails[0];
    const result = await dataService.create(CLIENT, email);
    expect(result).toBeTruthy();
    
    const messageId = result.messages[0].messageId;
    
    const msg = await dataService.readMessage(messageId);
    expectNewMessage(result.transactionId, messageId, msg, email);
  });
  
  it('should error deleting by client with no client.', async () => {
    await expect(dataService.deleteTransactionsByClient(undefined)).rejects.toThrow();
  });
  
  it('should delete all records when delete by client called.', async () => {
    const email = emails[0];
    const client = 'unittesting-delete-by-client';
    const result = await dataService.create(client, email);
    expect(result).toBeTruthy();
    
    const transactionId = result.transactionId;
    const transact = await dataService.readTransaction(transactionId);
    expect(transact).toBeTruthy();
    expect(transact.client).toMatch(client);
    expect(transact.messages).toBeTruthy();
    expect(transact.messages).toHaveLength(1);
    
    // add in a queue record...
    const queueId = uuidv4();
    const newStatus = 'a whole new status';
    const msg = await dataService.updateStatus(transact.messages[0].messageId, queueId, newStatus);
    expect(msg.statusHistory).toHaveLength(2);
    expect(msg.queueHistory).toHaveLength(1);
    
    // ok, now let's delete...
    await dataService.deleteTransactionsByClient(client);
    // and we should error out trying to read our transaction... (not found)
    await expect(dataService.readTransaction(transactionId)).rejects.toThrow();
  });
  
  it('should set content email to null', async () => {
    const email = emails[0];
    const result = await dataService.create(CLIENT, email);
    expect(result).toBeTruthy();
    expect(result.messages[0].content.email).toBeTruthy();
    
    await dataService.deleteContent(result.messages[0].messageId);
    
    const msg = await dataService.readMessage(result.messages[0].messageId);
    expect(msg.content.email).toBeFalsy();
    
  });
  
  it('should error set content email to null no message id.', async () => {
    await expect(dataService.deleteContent(undefined)).rejects.toThrow();
  });
  
});

