# @astronautlabs/scte104
## Implementation of the SCTE-104 TCP/IP protocol

This Typescript library provides a low-level, compliant implementation of the 
Automation System to Compression System TCP/IP signalling protocol 
specified in SCTE-104. It can be used to send signals to compliant 
SCTE-104 Injectors, Encoders or other compatible applications.

## Example Usage

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

## State of this library

This library is very new, and no compatibility is currently guaranteed between 
releases (alpha, semver 0.0.x).

## Roadmap
- Implement the "server" (Communication System) side of the protocol
- Provide an easy to access API for SCTE-104 encoding/decoding for auxiliary usecases
- Provide an optional higher-level, opinionated fluent API on top
