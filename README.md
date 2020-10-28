# @astronautlabs/scte104
> **Alpha Quality**  
> This library is very new, and no compatibility is currently guaranteed between 
> releases (alpha, semver 0.0.x).

Implementation of the SCTE-104 TCP/IP protocol

This Typescript library provides a low-level, compliant implementation of the 
Automation System to Compression System TCP/IP signalling protocol 
specified in SCTE-104. It can be used to make calls to compliant 
SCTE-104 "injectors" or to implement SCTE-104 "injectors" themselves.

The library supports all of the messages for Provisioning and Alarm Management (PAMS),
encryption, scheduling, and nearly all the messages that are outside of the "Simple Profile" specified in SCTE-104. Messages which are not natively supported can still be sent and received using custom implementations.

Uses [@/bitstream](https://github.com/astronautlabs/bitstream) to handle bitstream serialization/deserialization.

# Client

```typescript
import * as SCTE104 from "@astronautlabs/scte104";

async function main(argv : string[]) {
    let client = new SCTE104.Client();
    await client.connect('10.10.10.0');
    await client.init();

    // Signal a spliceStart_normal in immediate mode
    await client.multipleOperations({
        operations: [
            <SCTE104.Splice>{
                opID: SCTE104.MOP.SPLICE,
                splice_insert_type: SCTE104.SPLICE_START_NORMAL,
                splice_event_id: Date.now() / 1000,
                unique_program_id: 22211,
                pre_roll_time: 4000,
                break_duration: 0,
                avail_num: 0,
                avails_expected: 0,
                auto_return_flag: 1
            }
        ]
    })

    // spliceEnd_normal
    await client.multipleOperations({
        operations: [
            <SCTE104.Splice>{
                opID: SCTE104.MOP.SPLICE,
                splice_insert_type: SCTE104.SPLICE_END_NORMAL,
                splice_event_id: Date.now() / 1000,
                unique_program_id: 22211,
                pre_roll_time: 4000,
                break_duration: 0,
                avail_num: 0,
                avails_expected: 0,
                auto_return_flag: 1
            }
        ]
    })
}

main(process.argv.slice(1));
```

# Server [WIP]

```typescript
import * as SCTE104 from '@astronautlabs/scte104';

let server = new SCTE104.Server();
server.messageReceived.subscribe(event => {

    // For example:
    
    if (event.message.opID == SCTE104.OP.INIT_REQUEST) {
        await event.connection.sendMessage(new SCTE104.InitResponse().with({
            result: SCTE104.RESULT.SUCCESS
        }));
    }
});
server.listen();

```

The class of `event.message` is dependent on the type of message being sent.
It can be a subclass of `SingleOperationMessage` or an object of type `MultipleOperationMessage`. You can compare the `opID` field of the message to 
the constants found in `SCTE104.OP` and `SCTE104.MOP`, depending on the type of 
operation you are interested in. 

`event.connection` represents the incoming network connection which sent the 
message. This allows you to respond once you've completed processing on the incoming 
message.

You (as the caller of the library) are expected to provide your own application logic. 
The Server class just exposes the ability to accept a connection from a '104 client,
subscribe to notifications of incoming messages from that connection, and send messages
back.

# Roadmap
- Implement the "server" (Communication System) side of the protocol
- Provide an easy to access API for SCTE-104 encoding/decoding for auxiliary usecases
- Provide an optional higher-level, opinionated fluent API on top
