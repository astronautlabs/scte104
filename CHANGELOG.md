# v1.0.1

- Fixes [#3](https://github.com/astronautlabs/scte104/issues/3) Bug: Unit confusion (seconds vs microseconds) in microseconds field of Keep Alive request (Client#alive()) 
    * **Bug**: Unit confusion in `microseconds` field of `Time` structure delivered by `Client#alive()` in keep alive requests as specified in SCTE 104 2019 section 9.2.1
    * **Impact**: Affects @/scte104@1.0.0 and earlier

# v1.0.0

Initial stable version