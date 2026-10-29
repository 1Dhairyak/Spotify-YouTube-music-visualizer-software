package io.github.onedhairyak.lyricconstellation;

import android.service.notification.NotificationListenerService;

/** Empty on purpose: Android only lets an app read other apps' media sessions while it has notification access,
 *  which is granted to a listener service like this one. Notifications themselves are never read. */
public class MediaListener extends NotificationListenerService {
}
