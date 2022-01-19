import axios from "axios";
import cheerio, { CheerioAPI } from "cheerio";
import moment from "moment";

interface IParserOptions {
    host: string;
}

const pages = {
    schedule: "/studentu/raspisanie-zanyatiy/",
    replacements: "/studentu/izmeneniya-v-raspisanii/",
    replacementsOnDay: "/rasp-management/print-replaces.php?date=",
} as const;

class Parser {
    private _host: string;

    constructor({ host = "https://mpt.ru" }: Partial<IParserOptions> = {}) {
        this._host = host;
    }

    public async getCurrentWeek(): Promise<MPT.TWeek> {
        const $ = await this._loadPage(pages.schedule);
        const parsedWeek = $("span.label").text().trim();
        if (/Знаменатель/i.test(parsedWeek)) {
            return "Знаменатель";
        } else if (/Числитель/i.test(parsedWeek)) {
            return "Числитель";
        } else {
            throw new Error("Unknown week");
        }
    }

    public async getSchedule(): Promise<MPT.Schedule.ISpecialty[]> {
        const $ = await this._loadPage(pages.schedule);

        const specialtyList: MPT.Schedule.ISpecialty[] = [];
        const schedule = $("div.tab-content:nth-child(6)");

        schedule.children().each((index, element) => {
            const elem = $(element);
            const specialty: MPT.Schedule.ISpecialty = {
                name: elem
                    .find("h2:nth-child(1)")
                    .text()
                    .trim()
                    .replace("Расписание занятий для ", ""),
                groups: [],
            };

            const specialtyGroups = elem.find(".tab-content").first();

            specialtyGroups.children().each((index, element) => {
                const elem = $(element);

                const groupsNames = this._fixNonDecodeString(
                    elem.find("h3").text().trim()
                )
                    .replace("Группа ", "")
                    .split(", ");

                const groupWeekSchedule: MPT.Schedule.IDay[] = [];

                const weekSchedule = elem.find("table:nth-child(2)").children();
                weekSchedule.each((index, element) => {
                    const elem = $(element);
                    if (elem.prop("name") === "tbody") {
                        return;
                    }

                    const title = elem.find("h4");
                    const placeName = title.find("span").text().trim();
                    const dayName = title.text().replace(placeName, "").trim();

                    const daySchedule: MPT.Schedule.IDay = {
                        num: this._getDayNum(dayName),
                        place: placeName.replace(/\(|\)/g, "") || "Отсутствует",
                        lessons: [],
                    };

                    const schedule = elem.next().children();
                    schedule.each((index, element) => {
                        if (index === 0) {
                            return;
                        }

                        const elem = $(element);
                        const lessonNum = Number(
                            elem.find("td:nth-child(1)").text()
                        );

                        if (lessonNum === 0) {
                            return;
                        }

                        let lessonName: [string, string?];
                        let teacherName: [string, string?];

                        const lessonElement = elem.find("td:nth-child(2)");
                        const teacherElement = elem.find("td:nth-child(3)");

                        if (lessonElement.children().length === 0) {
                            lessonName = [
                                lessonElement.text().trim() || "Отсутствует",
                            ];
                            teacherName = [
                                teacherElement.text().trim() || "Отсутствует",
                            ];
                        } else {
                            lessonName = [
                                lessonElement
                                    .find("div:nth-child(1)")
                                    .text()
                                    .trim(),
                                lessonElement
                                    .find("div:nth-child(3)")
                                    .text()
                                    .trim(),
                            ];

                            teacherName = [
                                teacherElement
                                    .find("div:nth-child(1)")
                                    .text()
                                    .trim(),
                                teacherElement
                                    .find("div:nth-child(3)")
                                    .text()
                                    .trim(),
                            ];
                        }

                        daySchedule.lessons.push({
                            num: lessonNum,
                            name: lessonName,
                            teacher: teacherName,
                        });
                    });
                    groupWeekSchedule.push(daySchedule);
                });

                specialty.groups.push(
                    ...groupsNames.map((name) => {
                        return { name, days: groupWeekSchedule };
                    })
                );
            });

            specialtyList.push(specialty);
        });

        return specialtyList;
    }

    public async getReplacements(): Promise<MPT.Replacements.IDay[]> {
        const $ = await this._loadPage(pages.replacements);

        const list = $(
            ".container-fluid > div:nth-child(1) > div:nth-child(3)"
        );
        const response: MPT.Replacements.IDay[] = [];

        list.children().map((index, element) => {
            if (index === 0) {
                return;
            }

            const elem = $(element);

            if (elem[0].name === "h4") {
                const sourceDate = elem.text();
                const parsedDate = sourceDate.match(
                    /((?:\d{2}).(?:\d{2}).(?:\d{4}))/g
                );
                if (parsedDate === null) {
                    throw new Error("Date not found");
                }
                const date = moment(parsedDate[0], "DD.MM.YYYY").toDate();
                response.push({
                    date,
                    groups: [],
                });
                return;
            }

            if (elem[0].name !== "div") {
                return;
            }

            const sourceGroupNames = elem.find(
                "table:nth-child(1) > caption:nth-child(1) > b:nth-child(1)"
            );
            const groupNames = sourceGroupNames.text().split(", ");

            const replacements: MPT.Replacements.IReplacement[] = [];

            const replacementsList = elem.find(
                "table:nth-child(1) > tbody:nth-child(2) > tr:not(:first-child)"
            );

            for (const element of replacementsList) {
                const elem = $(element);

                const sourceLessonNum = elem.find("td:nth-child(1)").text();
                const sourceOldLesson = elem.find("td:nth-child(2)").text();
                const sourceNewLesson = elem.find("td:nth-child(3)").text();
                const sourceAddToSite = elem.find("td:nth-child(4)").text();

                if (sourceOldLesson.includes("ПРАКТИКА")) {
                    console.log(`"${sourceOldLesson}"`);
                    console.log(this._parseLesson(sourceOldLesson));
                }

                const [lessonNum, newLesson, oldLesson, addToSite]: [
                    number,
                    MPT.Replacements.ILesson,
                    MPT.Replacements.ILesson,
                    Date
                ] = [
                    parseInt(sourceLessonNum),
                    this._parseLesson(sourceNewLesson),
                    this._parseLesson(sourceOldLesson),
                    moment(sourceAddToSite, "DD.MM.YYYY HH:mm:ss").toDate(),
                ];

                replacements.push({
                    num: lessonNum,
                    new: newLesson,
                    old: oldLesson,
                    created: addToSite,
                });
            }

            groupNames.map((group) => {
                response[response.length - 1].groups.push({
                    group,
                    replacements,
                });
            });
        });

        return response;
    }

    public async getReplacementsOnDay(
        date: moment.MomentInput = new Date()
    ): Promise<MPT.Replacements.IGroup[]> {
        const selectedDate = moment(date);
        selectedDate.set("milliseconds", 0);
        selectedDate.set("seconds", 0);
        selectedDate.set("minutes", 0);
        selectedDate.set("hours", 0);

        const $ = await this._loadPage(
            pages.replacementsOnDay + moment(date).format("YYYY-MM-DD")
        );

        const response: MPT.Replacements.IGroup[] = [];
        const list = $("body").children();

        list.each((index, element) => {
            if (index === 0) {
                return;
            }
            const elem = $(element);
            const groupName = elem.find("caption").text().trim();
            const replacementsList = elem.find("tbody");

            const replacements: MPT.Replacements.IReplacement[] = [];

            replacementsList.children().each((index, element) => {
                if (index === 0) {
                    return;
                }
                const elem = $(element);
                const num = Number(elem.find("td:nth-child(1)").text().trim());

                const oldLessonString = elem
                    .find("td:nth-child(2)")
                    .text()
                    .trim();
                const newLessonString = elem
                    .find("td:nth-child(3)")
                    .text()
                    .trim();

                const oldLesson = this._parseLesson(oldLessonString);
                const newLesson = this._parseLesson(newLessonString);

                replacements.push({
                    new: newLesson,
                    old: oldLesson,
                    num,
                    created: selectedDate.toDate(),
                });
            });

            response.push(
                ...groupName.split(", ").map((group) => {
                    return { group, replacements };
                })
            );
        });

        return response;
    }

    public async *loadReplacements(
        minimalDate: Date,
        maximumDate = new Date()
    ): AsyncGenerator<MPT.Replacements.IGroup[], void, unknown> {
        const selectedDate = moment(minimalDate);
        selectedDate.isBefore(maximumDate);

        while (selectedDate.isBefore(maximumDate)) {
            yield await this.getReplacementsOnDay(selectedDate);
        }
    }

    private _parseLesson(lessonString: string): MPT.Replacements.ILesson {
        lessonString = lessonString.trim();
        const teachers = lessonString.match(/((?:[А-Я].){2} [А-Яа-я]*)/g);

        if (teachers) {
            return {
                name: lessonString
                    .replace(teachers.length === 1 ? teachers[0] : "", "")
                    .trim(),
                teacher: teachers.join(", "),
            };
        } else {
            return { name: lessonString, teacher: "Отсутствует" };
        }
    }

    private _generateCookie(): string {
        const id = Math.random().toString(36).substring(2);
        return `PHPSESSID=MPT_Parser#${id};`;
    }

    private _fixNonDecodeString(input: string): string {
        try {
            return decodeURI(
                input
                    .replace("_2C ", ", ")
                    .replace("_2F", "/")
                    .replace(/_/gi, "%")
            );
        } catch (error) {
            return input;
        }
    }

    private _getDayNum(dayName: string): number {
        moment.locale("ru");
        const days = moment.weekdays().map((x) => new RegExp(x, "gi"));
        return days.findIndex((x) => x.test(dayName));
    }

    private async _loadPage(path: string): Promise<CheerioAPI> {
        const html = (
            await axios.get(this._host + path, {
                headers: {
                    cookie: this._generateCookie(), // Bypassing an error bad request (occurs with a large number of requests from one IP)
                },
            })
        ).data as string;

        return cheerio.load(html);
    }
}

export default Parser;
