import { matchEvent, useContext, combineEffects, LoggerToken, LoggerLevel } from '@marblejs/core';
import { map, distinctUntilChanged, filter, tap } from 'rxjs/operators';
import { Transport } from '../transport/transport.interface';
import { AmqpConnectionStatus } from '../transport/strategies/amqp.strategy.interface';
import { RedisConnectionStatus } from '../transport/strategies/redis.strategy.interface';
import { ServerEvent } from '../server/messaging.server.events';
import { MsgServerEffect } from '../effects/messaging.effects.interface';
import { TransportLayerToken } from '../server/messaging.server.tokens';

const serverStatusMap = {
  connect: {
    [Transport.AMQP]: AmqpConnectionStatus.CONNECTED,
    [Transport.REDIS]: RedisConnectionStatus.CONNECT,
  },
  disconnect: {
    [Transport.AMQP]: AmqpConnectionStatus.CONNECTION_LOST,
    [Transport.REDIS]: RedisConnectionStatus.RECONNECTING,
  },
};

const connect$: MsgServerEffect = (event$, ctx) => {
  const logger = useContext(LoggerToken)(ctx.ask);
  const transportLayer = useContext(TransportLayerToken)(ctx.ask);

  return event$.pipe(
    matchEvent(ServerEvent.status),
    map(event => event.payload),
    distinctUntilChanged((p, c) => p.type === c.type),
    filter(({ type }) => type === serverStatusMap.connect[transportLayer.type]),
    tap(({ host, channel }) => logger({
      type: 'CONNECTED',
      message: `Connected server to host: ${host}`,
      level: LoggerLevel.INFO,
      tag: channel,
    })()),
  );
};

const disconnect$: MsgServerEffect = (event$, ctx) => {
  const logger = useContext(LoggerToken)(ctx.ask);
  const transportLayer = useContext(TransportLayerToken)(ctx.ask);

  return event$.pipe(
    matchEvent(ServerEvent.status),
    map(event => event.payload),
    distinctUntilChanged((p, c) => p.type === c.type),
    filter(({ type }) => type === serverStatusMap.disconnect[transportLayer.type]),
    tap(({ host, channel }) => logger({
      type: 'DISCONNECTED',
      message: `Disconnected server from host: ${host}`,
      level: LoggerLevel.ERROR,
      tag: channel,
    })())
  );
};

const error$: MsgServerEffect = (event$, ctx) => {
  const logger = useContext(LoggerToken)(ctx.ask);
  const transportLayer = useContext(TransportLayerToken)(ctx.ask);

  return event$.pipe(
    matchEvent(ServerEvent.error),
    map(event => event.payload),
    tap(({ error }) => logger({
      type: 'ERROR',
      message: `${error.name}, ${error.message}`,
      level: LoggerLevel.ERROR,
      tag: transportLayer.config.channel,
    })())
  );
};

export const statusLogger$ = combineEffects(
  connect$,
  disconnect$,
  error$,
);
