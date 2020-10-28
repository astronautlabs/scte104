import { Connection } from './server';
import * as syntax from './syntax';

export interface MessageEvent {
    message : syntax.Message;
    connection : Connection;
}
