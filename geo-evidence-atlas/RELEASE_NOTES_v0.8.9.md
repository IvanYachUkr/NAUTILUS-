# Geo Evidence Atlas v0.8.9

- Bundles OpenGuessr Research Round Recorder v0.6.4.
- Replaces the ineffective final **Done** button with **Done & disarm**.
- Done & disarm clears only the recorder tab state; saved round/session JSON files remain untouched.
- After disarming, the next OpenGuessr competition start dialog can show the normal Arm prompt again.
- Completed session manifests are no longer re-uploaded when a new competition is armed or a completed tab session is reset, avoiding misleading late `updatedAt` / `receivedAt` timestamps.
- Dataset, zero-pitch convention, visualization behavior, and recording schema remain unchanged.
