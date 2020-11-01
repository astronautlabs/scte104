import 'source-map-support/register';
import * as SCTE104 from "..";
import { TIME_TYPE_SMPTE_VITC, TimestampType2 } from '../protocol';
import { MultipleOperationMessage, SpliceRequest } from '../syntax';

async function main(argv : string[]) {
    let client = new SCTE104.ClientV2();
    let host = '1.2.3.4';

    console.log(`Connecting to ${host}...`);
    await client.connect(host);

    console.log(`Initializing connection...`);
    await client.init();

    console.log(`Ready!`);

    // spliceStart_normal
    console.log(`Sending spliceStart_normal...`);

    await client.request(
        new MultipleOperationMessage().with({
            operations: [
                new SpliceRequest().with({
                    opID: SCTE104.MOP.SPLICE,
                    spliceInsertType: SCTE104.SPLICE_START_NORMAL,
                    spliceEventId: Date.now() / 1000,
                    uniqueProgramId: 22211,
                    preRollTime: 4000,
                    breakDuration: 2400,
                    availNum: 0,
                    availsExpected: 0,
                    autoReturnFlag: 1
                })
            ]
        })
    );

    // console.log(`Sending spliceEnd_normal...`);
    // await client.request(
    //     new MultipleOperationMessage().with({
    //         operations: [
    //             new SpliceRequest().with({
    //                 opID: SCTE104.MOP.SPLICE,
    //                 spliceInsertType: SCTE104.SPLICE_END_NORMAL,
    //                 spliceEventId: Date.now() / 1000,
    //                 uniqueProgramId: 22211,
    //                 preRollTime: 4000,
    //                 breakDuration: 0,
    //                 availNum: 0,
    //                 availsExpected: 0,
    //                 autoReturnFlag: 1
    //             })
    //         ]
    //     })
    // );

    console.log(`Done!`);
}

main(process.argv.slice(1));