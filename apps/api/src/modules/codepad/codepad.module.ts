import { Module } from '@nestjs/common';
import { CodepadController } from './codepad.controller.js';
import { CodepadService } from './codepad.service.js';

@Module({ controllers: [CodepadController], providers: [CodepadService] })
export class CodepadModule {}
