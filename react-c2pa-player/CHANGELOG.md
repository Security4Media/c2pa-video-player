# Changelog

## [1.1.0](https://github.com/Security4Media/c2pa-video-player/compare/v1.0.0...v1.1.0) (2026-09-04)


### Features

* add adapter-agnostic ManifestSource type ([64df21f](https://github.com/Security4Media/c2pa-video-player/commit/64df21fcc809694931801224e7be084bc9a8021a))
* add Dublin Core manifest selector ([1a2275a](https://github.com/Security4Media/c2pa-video-player/commit/1a2275aacdb23ddc54fdf1487e4b11717632681c))
* add hls fragmented c2pa validation adapter ([9727ef5](https://github.com/Security4Media/c2pa-video-player/commit/9727ef5ddd58b360d14e51f4f8b77a1b95bab417))
* add live DASH C2PA validation via @qualabs/c2pa-live-dashjs-plugin ([abe51d3](https://github.com/Security4Media/c2pa-video-player/commit/abe51d3fe4875c644ed6d0896a7e5a93a27f008c))
* add ManifestSource dispatch helper for menu selectors ([38a6c61](https://github.com/Security4Media/c2pa-video-player/commit/38a6c61ac32b4451f10895231c6b2c8a9b41d31d))
* add React C2PA player application ([d67b82b](https://github.com/Security4Media/c2pa-video-player/commit/d67b82b7c18ce4d100b9436155ba5bb6e472593f))
* add selectedSegment to the shared player-root state ([edebf08](https://github.com/Security4Media/c2pa-video-player/commit/edebf08c61629d6e61c526d4196d65f6a9bc72d8))
* add supportsLive and requiresPlayerOwnership adapter capability metadata ([44c8a4d](https://github.com/Security4Media/c2pa-video-player/commit/44c8a4d891fa589edd00a083a0c4d97eeccdb379))
* add trust stores and sample media ([5fd6372](https://github.com/Security4Media/c2pa-video-player/commit/5fd637255a3f5774f40eced5484e2b53f4efc152))
* click a non-Valid/Trusted timeline segment to inspect it ([6b265f1](https://github.com/Security4Media/c2pa-video-player/commit/6b265f148f8f655f155dbb074085dd8535a5f083))
* populate ManifestSource for DASH segment results ([3e058ea](https://github.com/Security4Media/c2pa-video-player/commit/3e058ea9df20142471cd3401132b2df285010742))
* populate ManifestSource for HLS results ([cc849bb](https://github.com/Security4Media/c2pa-video-player/commit/cc849bb1ee0414a13c71b2544694826812b6fa51))
* populate ManifestSource for monolithic results and the shared unknown fallback ([f5589e9](https://github.com/Security4Media/c2pa-video-player/commit/f5589e93d2be4e1d92eca17efe27e7dee0ba7d32))
* render a selected segment's manifest/integrity verdict in the menu ([8b5e5cf](https://github.com/Security4Media/c2pa-video-player/commit/8b5e5cf84690aee6bc18aca1512a18c0f5f515ba))
* split player into a publishable library, add Docker image and release CI ([#20](https://github.com/Security4Media/c2pa-video-player/issues/20)) ([cc1716f](https://github.com/Security4Media/c2pa-video-player/commit/cc1716f4bc3c6580c1fb82fa73ced9ba39429619))
* thread manifestRef through the fragmented timeline projector ([6437423](https://github.com/Security4Media/c2pa-video-player/commit/643742391d0f9741afd71fb62ffa079ae03ace93))
* update HLS validation adapter and local trust settings for improved configuration ([9c1e718](https://github.com/Security4Media/c2pa-video-player/commit/9c1e718d7d5553e1de5d15feba345b79ad2eb0d2))


### Bug Fixes

* cawg_store.cfg fo cawg trust ([0266fd6](https://github.com/Security4Media/c2pa-video-player/commit/0266fd6df2bfa0675594be149866c073624c6195))
* clear selectedSegment on menu close, manifest change, and dispose ([fc83b9d](https://github.com/Security4Media/c2pa-video-player/commit/fc83b9dab1027860b2aaa320bb213d732fd2ebef))
* distinguish c2pa_achors and cawg_anchors ([ee0cda4](https://github.com/Security4Media/c2pa-video-player/commit/ee0cda4dad57eb914924ef9db4eb77bafba74aa4))
* don't show a stale validation badge when seeking into unvalidated HLS territory ([a8691a9](https://github.com/Security4Media/c2pa-video-player/commit/a8691a911e8d4f5c4ac4d54237ed4c1b158250a3))
* exclude @nettrek/c2pa-hls-bridge from dep optimization in the deploy build ([2b4d4a7](https://github.com/Security4Media/c2pa-video-player/commit/2b4d4a7816baeee91f5cf251a268d3095d68ece4))
* guard against dispose-during-load resource leaks in HLS/monolithic runtimes ([282fb19](https://github.com/Security4Media/c2pa-video-player/commit/282fb19367b2af5df72863d921885bfbd687fb81))
* keep VOD HLS/DASH timeline colors when seeking backward ([9c592f8](https://github.com/Security4Media/c2pa-video-player/commit/9c592f8414d3e8841cb0d5e64c77e45af45a5998))
* keep VOD HLS/DASH timeline colors when seeking backward ([0e94c39](https://github.com/Security4Media/c2pa-video-player/commit/0e94c3938710691668a0ee64292ac173baf691a3))
* make HLS trust work, and let each fragment keep its own verdict ([#18](https://github.com/Security4Media/c2pa-video-player/issues/18)) ([0c99e76](https://github.com/Security4Media/c2pa-video-player/commit/0c99e76bb7ba654b4d4fe9e97d0aa61addda4f53))
* never fabricate a success entry for unsigned (Unknown) content ([099b020](https://github.com/Security4Media/c2pa-video-player/commit/099b02092844b0b0979fe3bf5063f53cc09f2b81))
* opt HLS validation into the WebCrypto engine too, same WASM/SRI issue ([a9381cf](https://github.com/Security4Media/c2pa-video-player/commit/a9381cf2f3943af9498854c6688a827e87e6a261))
* render CAWG/organization/history sections for adapters with no ManifestStore ([86a5510](https://github.com/Security4Media/c2pa-video-player/commit/86a55105b68f0480d8bcf77009b4348436876066))
* replace vendored c2pa-hls-bridge fork with the officially published npm package ([eb12bf7](https://github.com/Security4Media/c2pa-video-player/commit/eb12bf7c0c6098ddda68b3360b80803b953f7fdf))
* reset menu UI state per-segment, not just per-manifest ([304253f](https://github.com/Security4Media/c2pa-video-player/commit/304253fcbbf447de63c289e66e153829788f9cea))
* restore the community trust-anchor/allow-list union ([4d546ae](https://github.com/Security4Media/c2pa-video-player/commit/4d546aed079e07eee9eb11917475a562521e282d))
* show only the failure message when a manifest is invalid ([b4fb914](https://github.com/Security4Media/c2pa-video-player/commit/b4fb914ec07372afe577ac0571a0b11d7d609eed))
* show only the failure message when a manifest is invalid ([b1985ff](https://github.com/Security4Media/c2pa-video-player/commit/b1985ff985e15328bb9e6cb6d05d0bff7110d806))
* stop showing an HLS-specific loading message for DASH sources ([6afe250](https://github.com/Security4Media/c2pa-video-player/commit/6afe250aa9aad24c02fa87e01a6b12c792805eb0))
* surface DASH plugin errors, bound live-session growth, flag correlation drift ([878a28c](https://github.com/Security4Media/c2pa-video-player/commit/878a28c33c2b24c84b0f64b897f831655a919029))
* surface HTTP failures fetching the monolithic media source ([72c7b81](https://github.com/Security4Media/c2pa-video-player/commit/72c7b810d67717e660c2e3bc0809976ec868d395))
* use local trust assets for hls validation ([d4a746c](https://github.com/Security4Media/c2pa-video-player/commit/d4a746cdb232ba92087dbcd6dac4ea959c44e7e3))
* use real segment start times in the DASH validation timeline ([ccb83fe](https://github.com/Security4Media/c2pa-video-player/commit/ccb83fe7e37b579d80fe377303b28f231e3bea4a))
* use the WebCrypto C2PA engine for monolithic validation, not WASM ([9f40185](https://github.com/Security4Media/c2pa-video-player/commit/9f40185ee351af6a33996712622bc6cab032fe8a))
