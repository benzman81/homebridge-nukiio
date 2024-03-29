## 0.16.1

Added some temporary logging.

## 0.16.0

New features:

  - Support Nuki Smart Door.
  - Support Nuki Smart Lock 3.0 (Pro).

## 0.15.4

Bugfix:

  - Fixed HTTP 503 Error while retrieving or adding callback by using retries.

## 0.15.3

New features:

  - New button in opener to deactivate doorbell ring.

## 0.15.2

New features:

  - New setting for sending hashed token instead of plaintext.

## 0.15.1

New features:

  - New setting for locks preventLockingIfAlreadyLocked.

## 0.15.0

New features:

  - Support Nuki Opener ringactionState in callback as doorbell.

## 0.14.0

New features:

  - Support Nuki battery charging and battery charging state (needs bridge firmware version 2.7.0 or 1.17.0 and smart lock firmware version 2.8.1/1.10.0).

## 0.13.2

Bugfix:

  - Fixed Config UI X schema file to not generate lock or opener for empty config.
  - Fixed that homebrige crashes if there is invalid config.

## 0.13.1

New features:

  - Now the cache by default is stored in hombridge storage path '.homebridge-nukiio'.

Bugfix:

  - Fixed Config UI X schema file.

## 0.13.0

New features:

  - Support Config UI X.

## 0.12.0

New features:

  - Make lock "ring to open" and "continuous mode" optional.

## 0.11.1

Bugfix:

  - Fixed battery status after homebridge restart.

## 0.11.0

New features:

  - Added door contact sensor support for Nuki 2.0 (needs bridge firmware version 2.6.0 or 1.16.0).

## 0.10.0

New features:

  - Added a switch to locks with usesDoorLatch = true to de-/activate pulling the latch. Implemented to prevent accidental unlatch of door.
    You can use automations to switch to desired state (i.e. based on location or time).

Feature changes and removal:

  - Door latch handling changed. If you define usesDoorLatch = true you will no longer get three locks, but only two.
    One that just does lock/unlock (without pulling the latch), and one that always is displayed as locked and pulls
    the door latch on unlock. This way done from personal experience where only these two are only needed. Other behavoirs
    could be done using scenes. Since one lock was removed you need to adapt your existing scenes/automations that used this lock.

## 0.9.0

New features:

  - Under the hood improvements.

## 0.8.0

New features:

  - Added suppert of Nuki Opener. See README for details.
  - Retry of LockActions is now also done fpr 503 errors.
  - Make retry behavior configurable.
  - Added parameter 'request_timeout_other' to set timeout for all other communication with bridge (get/list/add callbacks, maintainance calls, etc.)

## 0.7.9

Bugfix:

  - No homekit notifications if homebridge restarts (thanks to nicoh88).

## 0.7.8

New features:

  - Updated dependency to request.

## 0.7.7

Bugfix:

  - Listen to Ipv4.

## 0.7.6

Bugfix:

  - Fix initial state.

## 0.7.5

Bugfix:

  - More fixings on updating state.

## 0.7.4

Bugfix:

  - Fixed some issues updating state for "always unlock" and "always unlatch".

## 0.7.3

Bugfix:

  - Fixed some issues updating state correctly.

## 0.7.2

Bugfix:

  - Now uses updateValue instead of setValue to update iOS correctly.

## 0.7.1

Bugfix:

  - Fixed README.

## 0.7.0

Feature changes and removal:

  - Door latch handling changed. You can no longer define lock and unlock actions. Instead you need to define if a door uses a door latch.
    If so, than three locks will be added to homekit. One that unlocks the door pulling the door latch, one that unlocks the door without
    pulling the door latch, and one that always is display as locked and pulls the door latch on unlock.
  - You cannot add multiple locks with the same id anymore.

## 0.6.4

New features:

  - Lock actions will now be called one more time if bridge returns success = false. This can happen due to connection issues.

## 0.6.3

Bugfix:

  - Initial lock state request now works for lock state mode 1.

## 0.6.2

Bugfix:

  - In case of a connection error during a lock action assume that it was successful. In rare cases this might be wrong, but in most cases I experienced a connection error the lock action was executed succesfully.

## 0.6.1

Bugfix:

  - Button to refresh all now also pushes refreshed states to HomeKit.

## 0.6.0

New features:

  - Implemented lock state mode "2".
  - Added the ability to add maintainance buttons for reboot, firmware update, and to refresh all locks state.
  - Added methods to bridge for reboot, firmware update, and for refreshing all locks.

Bugfix:

  - Changed some methods to be marked as private.
  - Update of README.md.
  - Changed text for AccessoryInformation.

## 0.5.5

Bugfix:

  - If an error occured calling a lock action, then the state will be set to unkown.
  - Finally fixed state issue for state update from background (i.e. for Webhooks and doors with door latches).

## 0.5.4

Bugfix:

  - Move logging out put for successful message to actualle be called only after characteristics are set.
  - Removed unwanted console logging.
  - Only check initial locks state if lock_state_mode = 1.
  - More fixes on state issue for state update from background (i.e. for Webhooks and doors with door latches).

## 0.5.3

Bugfix:

  - Bridge url now does not need to start with protocol http.

## 0.5.2

New features:

  - Added priority to door to have a better order if you tell Siri to unlock all doors.
  - Added configuration for lock state mode.

Bugfix:

  - Json repsonse success=false was not shown as error.

## 0.5.1

Bugfix:

  - Removed unwanted logging.
  - Set default timeout for requesting lock state to 15 seconds.
  - Set default timeout for requesting lock action to 45 seconds.
  - Webhooks now work with Nuki bridge firmware 1.2.9 and up.

## 0.5.0

New features:

  - Make use of Nuki Webhook to avoid requests for lock state.
  - Updated according to Nuki HTTP API documentation v1.0.3.

Bugfix:

  - Added context to setValue call.
  - Hopefully fixed the state issue for state update from background (i.e. for Webhooks and doors with door latches).
  - Changed queue handling.

## 0.4.5

Bugfix:

  - Fix logging.
  - Always updated to battery is low state.

## 0.4.4

Bugfix:

  - Need to push battery state update back to HomeKit.

## 0.4.3

Bugfix:

  - Added battery state update to the webhook.

## 0.4.2

Bugfix:

  - Battery service is returned now.

## 0.4.1

New features:

  - Added information service.
  - Added battery service (only critical battery state is provided by Nuki, so no change in percentage).

Bugfix:

  - Extended logging.
  - Change cache key.

## 0.4.0

New features:

  - Changed to provide a platform with accessories. You must change your configuration.

## 0.3.11

Bugfix:

  - One more logging change to avoid confusion.

## 0.3.10

Bugfix:

  - Improved logging some more.

## 0.3.9

Bugfix:

  - Improved logging.

## 0.3.8

New features:

  - Added server for receiving webhook requests (early stage, as not released yet by Nuki and requirements are not clear).

Bugfix:

  - Next try to fix state for doors with door latches.
  - Doors with door latches now never execute a lock action.
  - CleanCode.

## 0.3.7

Bugfix:

  - Context drives me crazy in JS.

## 0.3.6

Bugfix:

  - Status cache corrected for doors with door latches.

## 0.3.5

Bugfix:

  - Variable corrected.

## 0.3.4

Bugfix:

  - Now, hopefully the status of doors with door latches works.

## 0.3.3

Bugfix:

  - Added missing parameter.

## 0.3.2

New features:

  - Use different request timeouts for lock state and lock action. (You might need to fix your configuration)

Bugfix:

  - Wrong logging for lock actions.

## 0.3.1

Bugfix:

  - Less logging.
  - Fix context, like always.

## 0.3.0

New features:

  - Again some major code re-work.

## 0.2.4

Bugfix:

  - Doors with door latches must never change to unlock state.

## 0.2.3

Bugfix:

  - Fix wrong function call for setting state.

## 0.2.2

Bugfix:

  - Fix context at other position.

## 0.2.1

Bugfix:

  - Fix context.

## 0.2.0

New features:

  - Support for doors with door latches. If you set "lock_action" and "unlock_action" both to "3" you get an accessory that shows always locked state and always does an unlatch.
  - You can now set the directory for the local cache.
  - Major re-work on request handling.

Others:

  - Changed default value of "request_timeout" to 60000 ms.
  - Clean code.

## 0.1.4

Bugfix:

  - Fix variable, again.

## 0.1.3

New features:

  - If a getState request is running for one lock and getState is requested again for this lock, no additional request will be made, it will use the cache set by the running request when this one ends.

## 0.1.2

Bugfix:

  - Set state to home kit even if a timeout was reached setting state as we can assume that everything went well and nuki is just too slow.

## 0.1.1

Bugfix:

  - Fix variable.

## 0.1.0

New features:

  - If timeout is reached use the last known state from cache.

Bugfix:

  - Use timeout on requests to bridge.

## 0.0.5

Bugfix:

  - Fixed socket hang up.

## 0.0.4

New features:

  - Added configuration for lock action and unlock action (i.e. if you want to unlatch instead of just unlock).

## 0.0.3

Initial release version.