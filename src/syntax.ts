import { BitstreamElement, BitstreamReader, Field, Marker, Variant, VariantMarker } from "@astronautlabs/bitstream";
import { Constructor } from "@astronautlabs/bitstream";
import * as Protocol from './protocol';

export function Operation(opCode : number) {
    return Variant(i => i.opID === opCode);
}

export function DefaultOperation() {
    return Variant(i => true, { priority: "last" });
}

export function MOperation(opCode : number) {
    return Variant((i : MOperationElement) => i.opID === opCode);
}

export function DefaultMOperation() {
    return Variant(i => true, { priority: "last" });
}

export class Message extends BitstreamElement {
    constructor() {
        super();
        this.opID = (this.constructor as any).OP;
    }

    @Marker() $startOfMessage;

    @Field(16) opID : number;
    @Field(16, { 
        writtenValue: i => i.measure(i => i.$startOfMessage, i => i.$endOfMessage) / 8
    }) messageSize : number;

    @VariantMarker() $variant;

    @Marker() $endOfMessage;
}

@Variant(i => i.opID !== 0xFFFF)
export class SingleOperationMessage extends Message {
    @Field(16) result : number = 0xFFFF;
    @Field(16) resultExtension = 0xFFFF;
    @Field(8) protocolVersion : number = 0;
    @Field(8) asIndex : number = 0;
    @Field(8) messageNumber : number;
    @Field(16) dpiPidIndex : number;
}

@DefaultOperation()
export class UnsupportedSOperation extends SingleOperationMessage {
    @Field(i => 8*(i.messageSize - 13)) data : Buffer;
}

@Operation(Protocol.OP.GENERAL_RESPONSE)
export class GeneralResponse extends SingleOperationMessage {
}

export class Timestamp extends BitstreamElement {
    @Field(8) timeType : number;
}

@Variant(i => i.timeType === Protocol.TIME_TYPE_UTC)
export class UtcTimestamp extends Timestamp {
    timeType : number = Protocol.TIME_TYPE_UTC;
    @Field(32) seconds : number;
    @Field(32) microseconds : number;
}

@Variant(i => i.timeType === Protocol.TIME_TYPE_SMPTE_VITC)
export class SmpteVitcTimestamp extends Timestamp {
    timeType : number = Protocol.TIME_TYPE_SMPTE_VITC;
    @Field(8) hours : number;
    @Field(8) minutes : number;
    @Field(8) seconds : number;
    @Field(8) frames : number;
}

@Variant(i => i.timeType === Protocol.TIME_TYPE_GPI)
export class GpiTimestamp extends Timestamp {
    timeType : number = Protocol.TIME_TYPE_GPI;
    @Field(8) number : number;
    @Field(8) edge : number;
}

export class Time extends BitstreamElement {
    @Field(32) seconds : number;
    @Field(32) microseconds : number;
}

export class MOperationElement extends BitstreamElement {
    @Field(16) opID : number;
    @Field(16, {
        writtenValue: i => i.measure(i => i.$startOfMopData, i => i.$endOfMopData) / 8
    }) 
    dataLength : number;

    @Marker() $startOfMopData;

    @VariantMarker() $variant;

    @Marker() $endOfMopData;
}

let NEXT_MESSAGE_NUMBER = 0;

@Operation(0xFFFF)
export class MultipleOperationMessage extends Message {
    constructor() {
        super();
        this.messageNumber = ++NEXT_MESSAGE_NUMBER;
    }

    @Field(8) protocolVersion = 0;
    @Field(8) asIndex = 0;
    @Field(8) messageNumber : number;
    @Field(16) dpiPidIndex : number = 0;
    @Field(8) scte35ProtocolVersion : number = 0;
    @Field() timestamp : Timestamp;
    @Field(0, { array: { countFieldLength: 8, type: MOperationElement }})
    operations : MOperationElement[] = [];
}

@DefaultMOperation()
export class UnsupportedMOperation extends MOperationElement {
    @Field(i => 8*i.dataLength) data : Buffer;
}

@Operation(Protocol.OP.INIT_REQUEST)
export class InitRequest extends SingleOperationMessage {
}

@Operation(Protocol.OP.INIT_RESPONSE)
export class InitResponse extends SingleOperationMessage {
}

@Operation(Protocol.OP.ALIVE_REQUEST)
export class AliveRequest extends SingleOperationMessage {
    @Field() time : Time;
}

@Operation(Protocol.OP.ALIVE_RESPONSE)
export class AliveResponse extends SingleOperationMessage {
    @Field() time : Time;
}

@Operation(Protocol.OP.INJECT_RESPONSE)
export class InjectResponse extends SingleOperationMessage {
    @Field(8) messageNumber : number;
}

@Operation(Protocol.OP.INJECT_COMPLETE_RESPONSE)
export class InjectCompleteResponse extends SingleOperationMessage {
    @Field(8) messageNumber : number;
    @Field(8) cueMessageCount : number;
}

@Operation(Protocol.OP.CONFIG_REQUEST)
export class ConfigRequest extends SingleOperationMessage {
    @Field(32) asIpAddress : number;
    @Field(16) asSocketNumber : number;
    @Field(8) activeFlag : number;
    @Field(8) protocolVersion : number;
    @Field(8) lastAsIndex : number;
    @Field(16) lastInjectorCount : number;
    @Field(8) permanentConnectionRequested : number;
}

@Operation(Protocol.OP.CONFIG_RESPONSE)
export class ConfigResponse extends SingleOperationMessage {
    @Field(8) asIndex : number;
    @Field(8) permanentConnectionRequested : number;
}

export class ProvisionedServiceDpiPid extends BitstreamElement {
    @Field(16) dpiPidIndex : number;
    @Field(8) sharedPid : number;
    @Field(8) cueStreamType : number;
}

export class ComponentTag extends BitstreamElement {
    @Field(8) value;
}

export class InjectorComponentList extends BitstreamElement {
    @Field(8) videoComponentTag : number;
    @Field(0, { array: { type: ComponentTag, countFieldLength: 8 }})
    audioComponentTags : ComponentTag[];
    @Field(0, { array: { type: ComponentTag, countFieldLength: 8 }})
    dataComponentTags : ComponentTag[];
}

export class ProvisionedService extends BitstreamElement {
    @Field(32) injectorIpAddress : number;
    @Field(16) injectorSocketNumber : number;
    @Field(32, { string: { encoding: 'ascii' } }) serviceName : string;
    @Field(0, { array: { type: ProvisionedServiceDpiPid, countFieldLength: 8 }}) 
    dpiPids : ProvisionedServiceDpiPid[];
    @Field(8) componentMode : number;

    @Field(0, { presentWhen: i => i.componentMode !== 0 })
    components : InjectorComponentList;
}

@Operation(Protocol.OP.PROVISIONING_REQUEST)
export class ProvisioningRequest extends SingleOperationMessage {
    @Field(0, { array: { countFieldLength: 8, type: ProvisionedService } }) 
    services : ProvisionedService[];
}

@Operation(Protocol.OP.FAULT_REQUEST)
export class FaultRequest extends SingleOperationMessage {
    @Field(32) injectorIpAddress : number;
    @Field(16) injectorSocketNumber : number;
    @Field(32, { string: { encoding: 'ascii' }}) injectorServiceName : string;
    @Field(16) dpiPidIndex : number;
}

@MOperation(Protocol.MOP.INJECT_SECTION) 
export class InjectSectionRequest {
    @Field(16) commandLength : number;
    @Field(8) protocolVersion : number;
    @Field(8) commandType : number;
    @Field(i => 8*i.commandLength) command : Buffer;
}

@MOperation(Protocol.MOP.SPLICE)
export class SpliceRequest extends MOperationElement {
    @Field(8) spliceInsertType : number;
    @Field(32) spliceEventId : number;
    @Field(16) uniqueProgramId : number;
    @Field(16) preRollTime : number;
    @Field(16) breakDuration : number;
    @Field(8) availNum : number;
    @Field(8) availsExpected : number;
    @Field(8) autoReturnFlag : number;
}

@MOperation(Protocol.MOP.SPLICE_NULL)
export class SpliceNullRequest extends MOperationElement {
}

@MOperation(Protocol.MOP.TIME_SIGNAL_REQUEST)
export class TimeSignalRequest extends MOperationElement {
    @Field(16) preRollTime : number;
}

@MOperation(Protocol.MOP.TIME_SIGNAL_REQUEST)
export class TransmitScheduleRequest extends MOperationElement {
    @Field(8) cancel : number;
}

// @MOperation(Protocol.MOP.COMPONENT_MODE_DPI)
// export class ComponentModeDPIRequest extends MOperationElement {
//     // TODO
// }

// export class ComponentModeDPI extends BitstreamElement {
//     // TODO
// }

@MOperation(Protocol.MOP.ENCRYPTED_DPI)
export class EncryptedDPIRequest extends MOperationElement {
    @Field(8) encryptionAlgorithm : number;
    @Field(8) cwIndex : number;
}

/**
 * From SCTE104 2015 9.8.5.1 (page 56):
 *     "This field carries a complete image of a standard SCTE 35 [1] descriptor, which
 *     follows MPEG-2 rules and has its length as the second byte of the descriptor. This request is used to
 *     inject proprietary, or future standard descriptors into a request without need for specific knowledge of the
 *     contents of the descriptor to be injected. For standard descriptors, the recommended method is to update
 *     this protocol to include a request for the new descriptor."
 */
export class DescriptorImage extends BitstreamElement {
    @Field(8) byte1;
    @Field(8) imageLength : number;
    @Field(i => 8*i.imageLength) content : Buffer;
}

@MOperation(Protocol.MOP.INSERT_DESCRIPTOR)
export class InsertDescriptorRequest extends MOperationElement {
    @Field(0, { array: { countFieldLength: 8, type: DescriptorImage } })
    descriptors : DescriptorImage[];
}

@MOperation(Protocol.MOP.INSERT_DTMF_DESCRIPTOR)
export class InsertDTMFDescriptorRequest extends MOperationElement {
    @Field(8) preRoll : number;
    @Field(8) dtmfLength : number;
    @Field(i => 8*i.dtmfLength) payload : Buffer;
}

export class ProviderAvail extends BitstreamElement {
    @Field(32) id : number;
}

@MOperation(Protocol.MOP.INSERT_AVAIL_DESCRIPTOR)
export class InsertAvailDescriptorRequest extends MOperationElement {
    @Field(0, { array: { type: ProviderAvail, countFieldLength: 8 }}) 
    avails : ProviderAvail[];
}

@MOperation(Protocol.MOP.INSERT_SEGMENTATION_DESCRIPTOR)
export class InsertSegmentationDescriptorRequest extends MOperationElement {
    @Field(32) eventId : number;
    @Field(8) eventCancelIndicator : number;
    @Field(16) duration : number;
    @Field(8) upidType : number;
    @Field(8) upidLength : number;
    @Field(i => i.upidLength) upid : Buffer;
    @Field(8) typeId : number;
    @Field(8) numberOfSegments : number;
    @Field(8) expectedSegments : number;
    @Field(8) durationExtensionFrames : number;
    @Field(8) deliveryNotRestrictedFlag : number;
    @Field(8) webDeliveryAllowedFlag : number;
    @Field(8) noRegionalBlackoutFlag : number;
    @Field(8) archiveAllowedFlag : number;
    @Field(8) deviceRestrictions : number;
}

@MOperation(Protocol.MOP.PROPRIETARY_COMMAND)
export class ProprietaryCommandRequest extends MOperationElement {
    @Field(32) proprietaryId : number;
    @Field(8) proprietaryCommand : number;
    @Field(i => 8*(i.dataLength - 5)) proprietaryData : Buffer;
}

// export class ScheduleComponentModeRequest extends MOperationElement {
//     // TODO
// }

@MOperation(Protocol.MOP.SCHEDULE_DEFINITION)
export class ScheduleDefinition extends MOperationElement {
    @Field(8) spliceScheduleCommand : number;
    @Field(32) spliceEventId : number;
    @Field() time : Time;
    @Field(16) uniqueProgramId : number;
    @Field(8) autoReturn : number;
    @Field(8) breakDuration : number;
    @Field(8) availNum : number;
    @Field(8) availsExpected : number;
}

@MOperation(Protocol.MOP.START_SCHEDULE_DOWNLOAD)
export class StartScheduleDownloadRequest extends BitstreamElement {
    @Field(0, { array: { type: ProviderAvail, countFieldLength: 8 }}) 
    providerAvails : ProviderAvail[];
}

@MOperation(Protocol.MOP.INSERT_TIER)
export class InsertTier extends BitstreamElement {
    @Field(16) tierData : number;
}

@MOperation(Protocol.MOP.INSERT_TIME_DESCRIPTOR)
export class InsertTimeDescriptor extends BitstreamElement {
    @Field(48) taiSeconds : number;
    @Field(32) taiNs : number;
    @Field(16) utcOffset : number;
}

@MOperation(Protocol.MOP.DELETE_CONTROLWORD)
export class DeleteControlWord extends BitstreamElement {
    @Field(8) cwIndex : number;
}

@MOperation(Protocol.MOP.DELETE_CONTROLWORD)
export class UpdateControlWord extends BitstreamElement {
    @Field(8) cwIndex : number;
    @Field(64) cwA : number;
    @Field(64) cwB : number;
    @Field(64) cwC : number;
}

@Operation(Protocol.OP.FAULT_RESPONSE)
export class FaultResponse extends SingleOperationMessage { 
}

@Operation(Protocol.OP.AS_ALIVE_REQUEST)
export class ASAliveRequest extends SingleOperationMessage {
}

@Operation(Protocol.OP.AS_ALIVE_RESPONSE)
export class ASAliveResponse extends SingleOperationMessage {
}
