import { describe } from "razmin";
import { MultipleOperationMessage } from "./syntax";

describe("SCTE-104", it => {
    it('parses a simple SCTE-104 message with no timestamp associated correctly', async () => {
        let bytes = Uint8Array.from([
            0xff, 0xff, 0x00, 0x1e, 0x00, 0x00, 0x25, 
            0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x01, 
            0x00, 0x0e, 0x01, 0x60, 0xc6, 0x5c, 0x03, 
            0x56, 0xc3, 0x0f, 0xa0, 0x09, 0x60, 0x00, 
            0x00, 0x01
        ]);

        let result = await MultipleOperationMessage.deserialize(bytes);
        
        // console.log(`Bytes: ${bytes.length}`);
        // console.dir(result);
    });

    it('parses a SCTE-104 message correctly when it has a UTC timestamp associated', async () => {
        let bytes = Uint8Array.from([
            0xff, 0xff, 0x00, 0x26, 0x00, 0x00, 0x01, 0x00, 0x00, 
            0x00, 0x01, 0x60, 0xc6, 0x54, 0x5b, 0x00, 0x00, 0x00, 0x00, 
            0x01, 0x01, 0x01, 0x00, 0x0e, 0x01, 0x60, 0xc6, 0x54, 0x5b, 
            0x56, 0xc3, 0x0f, 0xa0, 0x09, 0x60, 0x00, 0x00, 0x01
        ]);
        let result = await MultipleOperationMessage.deserialize(bytes);

        // console.log(`Bytes: ${bytes.length}`);
        // console.dir(result);
    })
});