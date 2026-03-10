// 文件: school.js

/**
 * 显示导入提示
 */
async function promptUserToStart() {
    const confirmed = await window.AndroidBridgePromise.showAlert(
        "导入确认",
        "导入前请确保您已进入课表页面（运行->课表查询->我的课表）并等待页面加载完成",
        "开始导入"
    );
    if (!confirmed) {
        AndroidBridge.showToast("用户取消了导入");
        return false;
    }
    AndroidBridge.showToast("开始获取课表数据...");
    return true;
}

/**
 * 获取 iframe 内容
 */
function getIframeDocument() {
    try { 
        // 尝试多种选择器找到 iframe 以防修改
        const selectors = [
            '.iframe___1hsk7',
            '[class*="iframe"]',
            'iframe'
        ];
        
        let iframe = null;
        for (const selector of selectors) {
            iframe = document.querySelector(selector);
            if (iframe) {
                console.log(`通过选择器 "${selector}" 找到 iframe`);
                break;
            }
        }
        
        if (!iframe) {
            console.error('未找到 iframe 元素');
            AndroidBridge.showToast("未找到课表框架，请确保在课表页面");
            return null;
        }
        
        // 获取 iframe 的 document
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        if (!iframeDoc) {
            console.error('无法访问 iframe 内容');
            AndroidBridge.showToast("无法访问课表内容，可能页面未加载完成");
            return null;
        }
        
        // 检查是否包含课表元素
        const timetable = iframeDoc.querySelector('.kbappTimetableDayColumnRoot');
        if (!timetable) {
            console.warn('iframe 中未找到课表元素，可能不在课表页面');
        }
        
        return iframeDoc;
        
    } catch (error) {
        console.error('获取 iframe 内容时出错:', error);
        AndroidBridge.showToast(`获取课表失败: ${error.message}`);
        return null;
    }
}

/**
 * 解析开学时间
 */
function extractStartDate() {
    const iframdate = getIframeDocument();
    if (!iframdate) return null;

    try {
        const dayElement = iframdate.querySelector('.kbappTimeZCText');  //<div class="kbappTimeZCText">第1周(3/9 ~ 3/15)</div>
        const semesterElement = iframdate.querySelector('.kbappTimeXQText');  //<div class="kbappTimeXQText">2025-2026学年 第2学期</div>
        if (!dayElement || !semesterElement) {
            return null;
        }
        const dayText = dayElement.textContent.trim();  //  第1周(3/9 ~ 3/15)
        const semesterText = semesterElement.textContent.trim();  //  2025-2026学年 第2学期  
        const startDate = parseStartDate(dayText, semesterText);
        // 要判断是第几学期来选择开学年

        return {startDate};  //传入解析后数据
    }

    catch (error) {
        console.error('解析开学时间时出错:', error);
        AndroidBridge.showToast(`解析开学时间失败: ${error.message}`);
        return null;
    }
        
}

/**
 * 解析开学时间
 * @param {string} weekText - 周次文本，如 "第1周(3/9 ~ 3/15)"
 * @param {string} semesterText - 学期文本，如 "2025-2026学年 第2学期"
 * @returns {string} 开学日期 YYYY-MM-DD
 */
function parseStartDate(weekText, semesterText) {
    // 1. 解析学期信息，获取学年和学期
    const semesterMatch = semesterText.match(/(\d{4})-(\d{4})学年\s*第(\d)学期/);
    if (!semesterMatch) {
        throw new Error('无法解析学期信息');
    }
    
    const startYear = parseInt(semesterMatch[1]); // 2025
    const endYear = parseInt(semesterMatch[2]);   // 2026
    const semester = parseInt(semesterMatch[3]);  // 1 或 2
    
    // 2. 解析周次信息，获取月份和日期范围
    const weekMatch = weekText.match(/第(\d+)周\((\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})\)/);
    if (!weekMatch) {
        throw new Error('无法解析周次信息');
    }
    
    const weekNumber = parseInt(weekMatch[1]);     // 周数
    const startMonth = parseInt(weekMatch[2]);     // 开始月份
    const startDay = parseInt(weekMatch[3]);       // 开始日期
    const endMonth = parseInt(weekMatch[4]);       // 结束月份
    const endDay = parseInt(weekMatch[5]);         // 结束日期
    
    console.log(`解析结果: 第${weekNumber}周, ${startMonth}/${startDay} ~ ${endMonth}/${endDay}`);
    
    // 3. 根据学期判断开学年份
    let startYearForDate;
    
    if (semester === 1) {
        // 第一学期：开学在 startYear 年
        startYearForDate = startYear;
    } else {
        // 第二学期：开学在 endYear 年（通常跨年）
        startYearForDate = endYear;
    }
    
    // 特殊情况处理：如果开始月份小于当前月份，可能需要调整年份
    // 比如 1月开学应该是 endYear 年
    const currentMonth = new Date().getMonth() + 1;
    if (startMonth < 6 && semester === 2) {
        // 第二学期如果在1-6月开学，应该用 endYear
        startYearForDate = endYear;
    }
    
    // 4. 构建开学日期（假设是第1周的周一，或者就用开始日期）
    // 这里用开始日期作为参考
    const startDateStr = `${startYearForDate}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    
    // 5. 如果是第1周，直接返回开始日期
    if (weekNumber === 1) {
        console.log(`开学日期: ${startDateStr}`);
        return startDateStr;
    }
    
    // 6. 如果不是第1周，需要往前推算
    // 计算第1周的日期
    const startDate = new Date(startYearForDate, startMonth - 1, startDay);
    const daysToSubtract = (weekNumber - 1) * 7;
    startDate.setDate(startDate.getDate() - daysToSubtract);
    
    const firstWeekStartDate = formatDate(startDate);

    return firstWeekStartDate;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}



/** 
 * 计算每天课程节数
 **/
function getSectionByPosition(element) {
    const dayColumn = element.closest('.kbappTimetableDayColumnRoot');
    const dayCols = Array.from(dayColumn.parentNode.children);
    const day = dayCols.indexOf(dayColumn) + 1;

    let slotBlock = element;
    while (slotBlock.parentElement && slotBlock.parentElement !== dayColumn) {
        slotBlock = slotBlock.parentElement;
    }

    const win = element.ownerDocument.defaultView || window;
    const getFlex = (el) => {
        const fg = win.getComputedStyle(el).flexGrow;
        return Math.round(parseFloat(fg || 0));
    };

    let previousFlexSum = 0;
    let curr = slotBlock.previousElementSibling;
    while (curr) {
        previousFlexSum += getFlex(curr);
        curr = curr.previousElementSibling;
    }

    const currentFlex = getFlex(slotBlock);
    
    // 换算
    let start = previousFlexSum + 1;
    let end = start + Math.max(1, currentFlex) - 1;


    // 这里的的start和end都加了午餐晚餐 午餐晚餐修正节数
    if (start >= 10) { 
        start -= 2;
        end -= 2;
    } else if (start > 5) {
        start -= 1;
        end -= 1;
    }

    return { day, start, end };
}

/**
 * 解析时间段数据
 */
function parseTimeSlots(iframeDoc) {
    const timeSlots = [];
    
    // 查找时间段列
    const timeColumn = iframeDoc.querySelector('.kbappTimetableJcColumn');
    
    const timeItems = timeColumn.querySelectorAll('.kbappTimetableJcItem');
    
    timeItems.forEach((item, index) => {
        const textElements = item.querySelectorAll('.kbappTimetableJcItemText');
        if (textElements.length >= 2) {
            const sectionName = textElements[0]?.textContent?.trim() || `第${index + 1}节`;
            const timeRange = textElements[1]?.textContent?.trim() || '';
            
            // 解析时间范围 
            const timeMatch = timeRange.match(/(\d{2}:\d{2})[~-](\d{2}:\d{2})/);
            if (timeMatch) {
                const startTime = timeMatch[1];
                const endTime = timeMatch[2];
                
                // 提取节次数字
                const sectionMatch = sectionName.match(/第(\d+)节/);
                const sectionNumber = sectionMatch ? parseInt(sectionMatch[1]) : index + 1;
                
                timeSlots.push({
                    number: sectionNumber,
                    startTime: startTime,
                    endTime: endTime
                });
                
                // console.log(`时间段 ${sectionNumber}: ${startTime} ~ ${endTime}`);

            }
        }
    });
    
    return timeSlots;
}


/**
 * 解析周次信息
 */
function parseWeeks(text) {
    const weeks = [];
    // 匹配如 1-16, 1, 3, 5-7 等模式
    const patterns = text.match(/(\d+)-(\d+)周|(\d+)周/g);
    if (!patterns) return weeks;

    const isSingle = text.includes('(单)');
    const isDouble = text.includes('(双)');

    patterns.forEach(p => {
        const range = p.match(/(\d+)-(\d+)/);
        if (range) {
            const start = parseInt(range[1]);
            const end = parseInt(range[2]);
            for (let i = start; i <= end; i++) {
                if (isSingle && i % 2 === 0) continue;
                if (isDouble && i % 2 !== 0) continue;
                weeks.push(i);
            }
        } else {
            const single = p.match(/(\d+)/);
            if (single) weeks.push(parseInt(single[1]));
        }
    });
    return weeks;
}

/**
 * 解析单个课程信息 
 */

// 这里源数据使用了el - popover 和el - popover__reference两种模式 一种是弹窗还要一种是课程块
// 我这里解析就只用了第一种popover  因为显示的数据精简 直接可以使用

function parseSingleCourse(courseElement, day, timeSlots) {
    try {
        const infoTexts = courseElement.querySelectorAll('.kbappTimetableCourseRenderCourseItemInfoText');
        if (infoTexts.length < 2) return null;
        
        // 课程名称
        let nameElement = courseElement.querySelector('.kbappTimetableCourseRenderCourseItemName');
        let rawName = nameElement ? nameElement.innerText.trim() : courseElement.innerText.split('\n')[0].trim();
        let name = rawName.replace(/\[.*?\]/g, "").replace(/\s+\d+$/, "").trim();
        if (name === "未知课程" || !name) return;

        // 获取持续时间
        const duration = parseInt(courseElement.getAttribute('data-scales-span') || '1');
        
        // 计算起始节次
        let startSection = 1;
        const parent = courseElement.closest('.kbappTimetableCourseRenderColumn');
        if (parent) {
            const containers = parent.querySelectorAll('.kbappTimetableCourseRenderCourseItemContainer');
            for (let i = 0; i < containers.length; i++) {
                const container = containers[i];
                const courseInContainer = container.querySelector('.kbappTimetableCourseRenderCourseItem');
                if (courseInContainer === courseElement) {
                    const flexMatch = container.style.flex?.match(/(\d+)/);
                    if (flexMatch) {
                        let totalPrevSpan = 0;
                        for (let j = 0; j < i; j++) {
                            const prevFlex = containers[j].style.flex?.match(/(\d+)/);
                            if (prevFlex) {
                                totalPrevSpan += parseInt(prevFlex[1]);
                            }
                        }
                        startSection = totalPrevSpan + 1;
                    }
                    break;
                }
            }
        }
        
        // 计算结束节次
        const endSection = startSection + duration - 1;
        
        // 验证范围
        const validStart = Math.max(1, Math.min(startSection, timeSlots?.length || 12));
        const validEnd = Math.max(validStart, Math.min(endSection, timeSlots?.length || 12));
        
        return {
            name: name,
            teacher: '未知教师',  // 暂时用默认值
            position: '未知教室',  // 暂时用默认值
            day: day,
            startSection: validStart,
            endSection: validEnd,
            weeks: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18],  // 暂时用默认值
            isCustomTime: false
        };
        
    } catch (error) {
        // console.error('解析出错:', error);
        return null;
    }
}

/**
 * 解析课程数据
 */
function parseCourses(iframeDoc, timeSlots) {
    const courses = [];
    
    // 获取所有星期列
    const dayColumns = iframeDoc.querySelectorAll('.kbappTimetableDayColumnRoot');
    // console.log('找到课表列数量:', dayColumns.length);
    
    
    // 遍历每一天的列
    for (let dayIndex = 0; dayIndex < dayColumns.length; dayIndex++) {
        const dayColumn = dayColumns[dayIndex];
        
        // 获取当天的所有课程
        const dayCourses = dayColumn.querySelectorAll('.kbappTimetableCourseRenderCourseItem');
        
        // console.log(`星期${dayIndex + 1} 课程数量:`, dayCourses.length);
        
        dayCourses.forEach(courseElement => {
            const courseInfo = parseSingleCourse(courseElement, dayIndex + 1, timeSlots);
            if (courseInfo) {
                courses.push(courseInfo);
            }
        });
    }
    
    return courses;
}

/**
 * 解析所有数据
 */

function parseAllData(iframeDoc) {
    const timeSlots = parseTimeSlots(iframeDoc);
    const courses = [];
    const courseElements = iframeDoc.querySelectorAll('.kbappTimetableCourseRenderCourseItem');

    courseElements.forEach(element => {
        try {
            const popoverId = element.getAttribute('aria-describedby');
            const popover = iframeDoc.getElementById(popoverId);
            if (!popover) return;

            const nameElement = popover.querySelector('.kbappTimetableCourseRenderCourseItemInfoPopperInfo');
            const name = nameElement ? nameElement.textContent.trim().replace(/\[.*?\]/g, "") : "";
            if (!name) return;

            // 获取位置信息
            const sectionInfo = getSectionByPosition(element);

            // --- 关键修正：获取所有信息行 (处理单双周不同行的情况) ---
            const infoItems = Array.from(popover.querySelectorAll('.kbappTimetableCourseRenderCourseItemInfoPopperInfo')).slice(1);
            
            infoItems.forEach(item => {
                const detailStr = item.textContent.trim();
                if (!detailStr) return;

                const parts = detailStr.split(/\s+/).filter(p => p.length > 0);
                let teacher = "未知教师";
                let posParts = [];
                let currentWeeks = parseWeeks(detailStr);

                parts.forEach(p => {
                    if (p.includes('周')) return;
                    // 老师判定：2-4个字且不含地点特征词
                    if (/^[\u4e00-\u9fa5]{2,4}$/.test(p) && !/(楼|校区|室|场|馆|中心)/.test(p)) {
                        teacher = p;
                    } else {
                        posParts.push(p);
                    }
                });

                // 地点去重：选最长的描述
                let position = posParts.sort((a, b) => b.length - a.length)[0] || "未知教室";

                courses.push({
                    name: name,
                    teacher: teacher,
                    position: position,
                    day: sectionInfo.day,
                    startSection: sectionInfo.start,
                    endSection: sectionInfo.end,
                    weeks: currentWeeks
                });
            });
        } catch (e) { console.error("解析单条课程失败:", e); }
    });

    return { courses: removeDuplicates(courses), timeSlots };
}

/**
 * 课程去重   后期这里可能会出现问题
 */

function removeDuplicates(courses) {
    const courseMap = new Map();
    
    courses.forEach(course => {
        // 生成唯一键（不包括周次）
        // 可以根据需要调整组合字段
        const key = `${course.day}-${course.startSection}-${course.endSection}-${course.name}-${course.position}`;
        
        if (courseMap.has(key)) {
            // 已存在：合并周次
            const existing = courseMap.get(key);
            // 合并并去重
            const combinedWeeks = [...existing.weeks, ...course.weeks];
            const uniqueWeeks = [...new Set(combinedWeeks)];
            // 排序
            existing.weeks = uniqueWeeks.sort((a, b) => a - b);
            
            // 如果需要，可以保留最早出现的教师（如果教师不同的话）
            // 但这里保持原有逻辑，不更新教师
        } else {
            // 不存在：添加新记录
            courseMap.set(key, {...course, weeks: [...course.weeks]});
        }
    });
    
    // 转换回数组
    return Array.from(courseMap.values());
}

/**
 * 保存课程数据
 */
async function saveCourses(parsedData) {
    const { courses, timeSlots } = parsedData;
    
            // 解析开学时间
    try {
        const startDateInfo = extractStartDate();
        if (!startDateInfo) {
            AndroidBridge.showToast("获取开学时间失败");
        }
        
        const configData = {
            semesterStartDate: startDateInfo?.startDate || null,  // 如果获取失败就传 null
        }

        AndroidBridge.showToast(`准备保存开学时间 ${startDateInfo.startDate}`);

        let courseSaveResult = await window.AndroidBridgePromise.saveCourseConfig (
            JSON.stringify(configData)  
        );
        
        if (!courseSaveResult) {
            AndroidBridge.showToast("保存开学时间失败，请自行设定");
        }


        AndroidBridge.showToast(`准备保存 ${courses.length} 门课程...`);
        
        // 保存课程数据
        courseSaveResult = await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(courses));
        if (!courseSaveResult) {
            AndroidBridge.showToast("保存课程失败");
            return false;
        }
        
        AndroidBridge.showToast(`成功导入 ${courses.length} 门课程`);
        
        // 保存时间段数据
        if (timeSlots && timeSlots.length > 0) {
            const timeSlotSaveResult = await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(timeSlots));
            if (timeSlotSaveResult) {
                AndroidBridge.showToast(`成功导入 ${timeSlots.length} 个时间段`);
            } else {
                AndroidBridge.showToast("时间段导入失败，课程仍可使用");
            }
        }
        
        return true;
    } catch (error) {
        console.error("保存课程数据时出错:", error);
        AndroidBridge.showToast(`保存失败: ${error.message}`);
        return false;
    }
}
async function fitTimes() {
    
}

/**
 * 运行主函数
 */
async function runImportFlow() {
    try {
        AndroidBridge.showToast("课表导入工具启动...");
        
        // 1. 显示导入提示
        const shouldProceed = await promptUserToStart();
        if (!shouldProceed) return;
        
        // 2. 等待一下确保页面加载
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. 获取 iframe 内容
        const iframeDoc = getIframeDocument();
        if (!iframeDoc) return;
        
        // 4. 解析数据
        AndroidBridge.showToast("正在解析课表数据...");
        const parsedData = parseAllData(iframeDoc);
        
        if (parsedData.courses.length === 0) {
            await window.AndroidBridgePromise.showAlert(
                "解析失败",
                "未找到任何课程数据，请确认：\n1. 已在课表查询页面\n2. 课表已完全加载\n3. 当前学期有课程",
                "知道了"
            );
            return;
        }

 
        
        // 5. 显示预览
        const previewMsg = `找到 ${parsedData.courses.length} 门课程\n${parsedData.timeSlots.length} 个时间段\n\n是否继续导入？`;
        const confirmed = await window.AndroidBridgePromise.showAlert(
            "导入确认",
            previewMsg,
            "确认导入"
        );
        
        if (!confirmed) {
            AndroidBridge.showToast("已取消导入");
            return;
        }
        
        // 6. 保存数据
        const saveSuccess = await saveCourses(parsedData);
        if (!saveSuccess) return;
        
        // 7. 完成
        AndroidBridge.showToast("课表导入完成！");
        AndroidBridge.notifyTaskCompletion();
        
    } catch (error) {
        console.error("导入流程出错:", error);
        AndroidBridge.showToast(`导入失败: ${error.message}`);
    }
}

// 启动导入流程
runImportFlow();