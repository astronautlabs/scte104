#!/usr/bin/env node

import "@alterior/platform-nodejs";

import { Command, CommandLine } from '@alterior/command-line';
import * as SCTE104 from '.';
const PKG = require('../package.json');

function spliceCommand(cmd: Command, description: string) {
    return addSpliceOptions(cmd .info({ description }));
}

function sleep(time = 0) {
    return new Promise(r => setTimeout(r, time));
}

async function connectToServer(cmd: Command) {
    let hostname = cmd.option('server').value;
    let port = Number(cmd.option('port').value ?? 5167);

    if (!hostname) {
        console.error(`You must specify --server <host|ip>`);
        process.exit(1);
    }

    let client = new SCTE104.Client();
    try {
        await client.connect(hostname, port);
    } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }

    return client;
}

function prepareMultiOp(cmd: Command) {
    let multiOp = new SCTE104.elements.MultipleOperationMessage();
    multiOp.opID = SCTE104.MULTIPLE_OPERATION_INDICATOR;

    if (cmd.option('no-timestamp').present) {
        multiOp.timestamp = new SCTE104.elements.Timestamp();
        multiOp.timestamp.timeType = SCTE104.TIME_NONE.time_type;
    } else if (cmd.option('utc-timestamp').value) {
        let date = new Date(cmd.option('utc-timestamp').value);

        if (isNaN(date.getTime())) {
            console.error(`Invalid timestamp: '${cmd.option('utc-timestamp').value}'`);
            process.exit(1);
        }

        let timestamp = new SCTE104.elements.UtcTimestamp();
        timestamp.seconds = Math.floor(date.getTime() / 1000);
        timestamp.microseconds = 0;
        multiOp.timestamp = timestamp;
    } else {
        let timestamp = new SCTE104.elements.UtcTimestamp();
        timestamp.seconds = Math.floor(Date.now() / 1000);
        timestamp.microseconds = 0;
        multiOp.timestamp = timestamp;
    }

    return multiOp;
}

function prepareSplice(cmd: Command, type: 'start' | 'end') {
    let splice = new SCTE104.elements.SpliceRequest();
    splice.opID = SCTE104.MOP.SPLICE;

    let spliceType: number;
    if (cmd.option('immediate').present) {
        if (type === 'start')
            spliceType = SCTE104.SPLICE_START_IMMEDIATE;
        else if (type === 'end')
            spliceType = SCTE104.SPLICE_END_IMMEDIATE;
    } else {
        if (type === 'start')
            spliceType = SCTE104.SPLICE_START_NORMAL;
        else if (type === 'end')
            spliceType = SCTE104.SPLICE_END_NORMAL;
    }

    splice.spliceInsertType = spliceType;
    splice.spliceEventId = Number(cmd.option('event-id').value ?? Math.floor(Date.now() / 1000));
    splice.uniqueProgramId = Number(cmd.option('program-id').value ?? 22211);
    splice.preRollTime = Number(cmd.option('preroll').value ?? 4000);
    splice.breakDuration = Number(cmd.option('break-duration').value ?? 2400);
    splice.availNum = Number(cmd.option('avail').value ?? 0);
    splice.availsExpected = Number(cmd.option('avails-expected').value ?? 0);
    splice.autoReturnFlag = cmd.option('auto-return').present ? 1 : 0;
    
    return splice;
}

function addSpliceOptions(cmd: Command) {
    return cmd .option({
            id: 'event-id',
            valueHint: 'id',
            description: 'Specify the event ID for this splice. By default the event ID is chosen based on the wall clock.'
        })
        .option({
            id: 'immediate',
            valueHint: 'i',
            description: 'Perform an "immediate" splice'
        })
        .option({
            id: 'program-id',
            valueHint: 'id',
            description: 'Specify the unique program ID for this splice. Defaults to 22211'
        })
        .option({
            id: 'preroll',
            valueHint: 'time-in-ms',
            description: 'Specify the preroll time for this splice in milliseconds. Defaults to 4000ms.'
        })
        .option({
            id: 'break-duration',
            valueHint: 'time-in-10ths-of-a-second',
            description: 'Specify the break duration for this splice in tenths of a second. Defaults to 2400 (4 minutes)'
        })
        .option({
            id: 'avail',
            valueHint: 'number',
            description: 'Specify which "avail" this splice represents. Defaults to zero.'
        })
        .option({
            id: 'avails-expected',
            valueHint: 'number',
            description: 'Specify how many "avails" are expected during this event. If zero, "--avail" has no meaning.'
        })
        .option({
            id: 'auto-return',
            description: 'Specify that this splice should automatically end without requiring a splice-end event. By default this is not the case.'
        })

}

let line = new CommandLine()
    .info({
        executable: 'scte104',
        description: 'Send SCTE 104 messages',
        copyright: 'Copyright 2022 Astronaut Labs, LLC',
        version: PKG.version
    })
    .option({
        id: 'server',
        valueHint: 'hostname|ip',
        description: 'The SCTE 104 injector/automation system to connect to'
    })
    .option({
        id: 'port',
        valueHint: 'number',
        description: 'The TCP port to connect to (defaults to 5167)'
    })
    .option({
        id: 'scte35-protocol-version',
        valueHint: 'number',
        description: 'Modify the SCTE-35 protocol version sent with the request. Defaults to zero.'
    })
    .option({
        id: 'utc-timestamp',
        description: 'Specify a UTC timestamp. Default is to send the current wall clock time as a UTC timestamp.',
        short: 'U',
        valueHint: 'timestamp'
    })
    .option({
        id: 'no-timestamp',
        description: 'Do not send a timestamp with the request.'
    })
    .option({
        id: 'as-index',
        valueHint: 'number',
        description: 'Specify the automation system index (asIndex). Defaults to 0.',
        short: 'I'
    })
    .option({
        id: 'dpi-pid-index',
        valueHint: 'number',
        description: 'Specify the DPI PID index to use. Defaults to 0.',
        short: 'P'
    })
    .command('splice-start', cmd => {
        spliceCommand(cmd, 'Send a Splice Start request')
            .run(async () => {
                let client = await connectToServer(cmd);
                let multiOp = prepareMultiOp(cmd);
                multiOp.operations = [ prepareSplice(cmd, 'start') ];
                client.sendMessage(multiOp);
                await sleep(500);
                await client.disconnect();
            })
        ;
    })
    .command('splice-end', cmd => {
        spliceCommand(cmd, 'Send a Splice End request')
        .run(async () => {
            let client = await connectToServer(cmd);
            let multiOp = prepareMultiOp(cmd);
            multiOp.operations = [ prepareSplice(cmd, 'end') ];
            client.sendMessage(multiOp);
            await sleep(500);
            await client.disconnect();
        })
        ;
    })
    .run(() => line.showHelp())
;

line.process();