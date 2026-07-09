// ─────────────────────────────────────────────────────────────────────────────
// Bộ Context Setting mặc định cho node Start (dạng JSON). Seed vào ô nhập khi
// node chưa có giá trị — người dùng chỉnh trực tiếp trên editor JSON.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CONTEXT_SETTING = `[
  {
    "contextName": "classification",
    "contextNameJp": "区分",
    "rangeValues": [
      { "order": 1, "value": "変更" },
      { "order": 2, "value": "キャンセル" },
      { "order": 3, "value": "その他" }
    ],
    "displayType": "CLASSIFICATION",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "patientName",
    "contextNameJp": "患者氏名",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "clinicalDepartment",
    "contextNameJp": "診療科",
    "rangeValues": [
      { "order": 1, "value": "外科" },
      { "order": 2, "value": "泌尿器科" },
      { "order": 3, "value": "心臓血管外科" },
      { "order": 4, "value": "循環器科" },
      { "order": 5, "value": "皮膚科" },
      { "order": 6, "value": "遺伝診療科" },
      { "order": 7, "value": "脳神経外科" },
      { "order": 8, "value": "眼科" },
      { "order": 9, "value": "集中治療科" },
      { "order": 10, "value": "耳鼻咽喉科" },
      { "order": 11, "value": "アレルギーセンター" },
      { "order": 12, "value": "救急診療部" },
      { "order": 13, "value": "新生児科" },
      { "order": 14, "value": "消化器科" },
      { "order": 15, "value": "神経内科" },
      { "order": 16, "value": "形成外科" },
      { "order": 17, "value": "総合診療部" },
      { "order": 18, "value": "整形外科" },
      { "order": 19, "value": "血液腫瘍科" },
      { "order": 20, "value": "血液内科" },
      { "order": 21, "value": "内分泌・代謝科" },
      { "order": 22, "value": "移植外科" },
      { "order": 23, "value": "腎臓・リウマチ・膠原病科" },
      { "order": 24, "value": "女性内科" },
      { "order": 25, "value": "移植・細胞治療科" },
      { "order": 26, "value": "細胞治療科" },
      { "order": 27, "value": "小児がん免疫診断科" },
      { "order": 28, "value": "脳神経腫瘍科" },
      { "order": 29, "value": "小児がんゲノム診療科" },
      { "order": 30, "value": "緩和ケア科" }
    ],
    "displayType": "DEPARTMENT",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "patientDateOfBirth",
    "contextNameJp": "生年月日",
    "rangeValues": [],
    "displayType": "DATE_OF_BIRTH",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "medicalCardNumber",
    "contextNameJp": "診察券番号",
    "rangeValues": [],
    "displayType": "NUMBER",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "reservationDate",
    "contextNameJp": "予約日",
    "rangeValues": [],
    "displayType": "DATE",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "additionalPhoneNumber",
    "contextNameJp": "連絡先電話番号",
    "rangeValues": [],
    "displayType": "PHONE_NUMBER",
    "editable": true,
    "deletable": false,
    "itemDefault": true
  },
  {
    "contextName": "identityVerification",
    "contextNameJp": "本人確認",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "changeContent",
    "contextNameJp": "変更内容",
    "rangeValues": [
      { "order": 1, "value": "予約の日程変更" },
      { "order": 2, "value": "診察内容の変更" }
    ],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "changeDetails",
    "contextNameJp": "詳細変更内容",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "preferredReservationPeriod",
    "contextNameJp": "予約希望時期",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "finalConfirmation",
    "contextNameJp": "最終確認",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "guestType",
    "contextNameJp": "患者／医療機関",
    "rangeValues": [
      { "order": 1, "value": "患者" },
      { "order": 2, "value": "医療機関" }
    ],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "personInCharge",
    "contextNameJp": "担当者名",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "urgency",
    "contextNameJp": "緊急性",
    "rangeValues": [
      { "order": 1, "value": "あり" },
      { "order": 2, "value": "なし" }
    ],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "ageAndGender",
    "contextNameJp": "年齢／性別",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "medicalInstitutionName",
    "contextNameJp": "医療機関名",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "diseaseSummary",
    "contextNameJp": "疾患の概要",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "other_appointment_exists",
    "contextNameJp": "他科予約有無",
    "rangeValues": [],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "callId",
    "contextNameJp": "通話ID",
    "rangeValues": [],
    "displayType": "NUMBER",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  },
  {
    "contextName": "phoneType",
    "contextNameJp": "電話タイプ",
    "rangeValues": [
      { "order": 1, "value": "携帯" },
      { "order": 2, "value": "固定" }
    ],
    "displayType": "TEXT",
    "editable": true,
    "deletable": true,
    "itemDefault": false
  }
]
`;
