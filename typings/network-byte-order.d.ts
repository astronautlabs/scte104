
declare module "network-byte-order" {
    function htonl(buffer : Buffer, index : number, value : number);
    function htons(buffer : Buffer, index : number, value : number);
    function ntohl(buffer : Buffer, index : number);
    function ntohlStr(s : string, index : number);
    function ntohs(buffer : Buffer, index : number);
    function ntohsStr(s : string, index : number);
}