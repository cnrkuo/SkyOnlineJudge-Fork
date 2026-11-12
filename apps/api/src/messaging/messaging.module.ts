import { Global, Module } from '@nestjs/common';
import { MessageBroker } from './message-broker.js';

@Global()
@Module({ providers: [MessageBroker], exports: [MessageBroker] })
export class MessagingModule {}
