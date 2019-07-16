import { matchEvent, use } from '@marblejs/core';
import { eventValidator$, t } from '@marblejs/middleware-io';
import { map, tap } from 'rxjs/operators';
import { createMicroservice } from './messaging.server';
import { messagingListener } from './messaging.server.listener';
import { Transport, TransportMessage } from '../transport/transport.interface';
import { createAmqpStrategy } from '../transport/strategies/amqp.strategy';
import { MsgEffect } from '../effects/messaging.effects.interface';
import { Subject } from 'rxjs';

describe('messagingServer', () => {

  describe('AMQP', () => {
    const options = {
      host: 'amqp://localhost:5672',
      queue: 'test_queue_server',
      queueOptions: { durable: false },
    };

    const microservice = (effect?: MsgEffect) => createMicroservice({
      options,
      transport: Transport.AMQP,
      messagingListener: messagingListener(effect ? { effects: [effect] } : undefined),
    });

    const runServer = (effect?: MsgEffect) => microservice(effect).run();
    const runClient = () => createAmqpStrategy(options).connect();
    const createMessage = (data: any): TransportMessage<Buffer> => ({
      data: Buffer.from(JSON.stringify(data)),
    });

    test('receives RPC response from consumer', async () => {
      const rpc$: MsgEffect = event$ =>
        event$.pipe(
          matchEvent('RPC_TEST'),
          use(eventValidator$(t.number)),
          map(event => event.payload),
          map(payload => ({ type: 'RPC_TEST_RESULT', payload: payload + 1 })),
        );

      const client = await runClient();
      const server = await runServer(rpc$);
      const message = createMessage({ type: 'RPC_TEST', payload: 1 });

      const result = await client.sendMessage(options.queue, message);
      const parsedResult = JSON.parse(result.data.toString());

      expect(parsedResult).toEqual({ type: 'RPC_TEST_RESULT', payload: 2 });

      await server.close();
    });

    test('emits event to consumer', async done => {
      const eventSubject = new Subject();
      const event$: MsgEffect = event$ =>
        event$.pipe(
          matchEvent('EVENT_TEST'),
          use(eventValidator$(t.number)),
          map(event => event.payload),
          map(payload => ({ type: 'EVENT_TEST_RESPONSE', payload: payload + 1 })),
          tap(event => eventSubject.next(event)),
        );

      const server = await runServer(event$);
      const client = await runClient();
      const message = createMessage({ type: 'EVENT_TEST', payload: 1 });

      await client.emitMessage(options.queue, message);

      eventSubject.subscribe(event => {
        expect(event).toEqual({ type: 'EVENT_TEST_RESPONSE', payload: 2 });
        setTimeout(() => server.close().then(done), 1000);
      });
    });
  });

});
