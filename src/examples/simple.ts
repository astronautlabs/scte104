import 'source-map-support/register';
import * as SCTE104 from "..";
import { TIME_TYPE_SMPTE_VITC, TimestampType2 } from '../protocol';

async function main(argv : string[]) {
    let client = new SCTE104.Client();
    let host = '1.2.3.4';

    console.log(`Connecting to ${host}...`);
    await client.connect(host);

    console.log(`Initializing connection...`);
    await client.init();

    console.log(`Ready!`);

    // spliceStart_normal
    console.log(`Sending spliceStart_normal...`);

    await client.multipleOperations({
        operations: [
            <SCTE104.Splice>{
                opID: SCTE104.MOP.SPLICE,
                splice_insert_type: SCTE104.SPLICE_START_NORMAL,
                splice_event_id: Date.now() / 1000,
                unique_program_id: 22211,
                pre_roll_time: 4000,
                break_duration: 2400,
                avail_num: 0,
                avails_expected: 0,
                auto_return_flag: 1
            }
        ]
    })

    // console.log(`Sending spliceEnd_normal...`);
    // await client.multipleOperations({
    //     operations: [
    //         <SCTE104.Splice>{
    //             opID: SCTE104.MOP.SPLICE,
    //             splice_insert_type: SCTE104.SPLICE_END_NORMAL,
    //             splice_event_id: Date.now() / 1000,
    //             unique_program_id: 22211,
    //             pre_roll_time: 4000,
    //             break_duration: 0,
    //             avail_num: 0,
    //             avails_expected: 0,
    //             auto_return_flag: 1
    //         }
    //     ]
    // });

    console.log(`Done!`);
}

main(process.argv.slice(1));