import { RecurrenceRule, scheduleJob } from 'node-schedule'

import { app } from './app'
import { shoutAboutTipOfTheWeek } from './tip-of-the-week'

// Every Monday at 9:00 AM London time, #general (2 hours after the Time Off message in #general)
const tipOfTheWeekRule = new RecurrenceRule()
tipOfTheWeekRule.dayOfWeek = 1
tipOfTheWeekRule.hour = 9
tipOfTheWeekRule.minute = 0
tipOfTheWeekRule.tz = 'Europe/London'
scheduleJob(tipOfTheWeekRule, shoutAboutTipOfTheWeek)

void app.start()
