import { Client, OP_SPLICE, Splice, SPLICE_END_NORMAL, SPLICE_START_NORMAL } from "..";

async function main(argv : string[]) {
    let client = new Client();
    await client.connect('10.10.10.0');
    await client.init();

    // spliceStart_normal
    await client.multipleOperations({
        operations: [
            <Splice>{
                opID: OP_SPLICE,
                splice_insert_type: SPLICE_START_NORMAL,
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
            <Splice>{
                opID: OP_SPLICE,
                splice_insert_type: SPLICE_END_NORMAL,
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