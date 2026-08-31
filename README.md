# 报价与客户询价管理系统

本地部署的报价与客户询价管理软件。

## 技术架构

- **Backend**: Node.js + Express + better-sqlite3(SQLite,本地文件持久化)
- **Frontend**: React 18 + Vite + React Router
- **Excel**: exceljs(导入 / 导出)
- **上传**: multer(产品图片 / Excel / PI 文件)

## 目录结构

```
├── server/               后端
│   ├── src/
│   │   ├── index.js      Express 入口(端口 3001)
│   │   ├── db.js         SQLite 数据库与 Schema
│   │   ├── upload.js     文件上传工具
│   │   ├── pi-parser.js  PI 成交识别(临时通用解析,等待真实模板)
│   │   └── routes/       products / customers / inquiries / quotations / dashboard
│   ├── data/app.db       SQLite 数据库文件(自动创建)
│   └── uploads/          images(产品图片)/ pi(PI 文件)/ imports(导入的 Excel)
└── client/               前端(Vite 开发端口 5173,已配置 /api 代理)
    └── src/pages/        Dashboard / ProductDatabase / CustomerInquiry /
                          CustomerManagement / CustomerDetail / QuotationDatabase
```

## 启动方式(开发模式)

需要两个终端:

```bash
# 终端 1 —— 后端
cd server
npm install     # 首次
npm start       # http://localhost:3001

# 终端 2 —— 前端
cd client
npm install     # 首次
npm run dev     # http://localhost:5173  ← 浏览器打开这个
```

## 启动方式(单进程生产模式)

```bash
npm run start   # 构建前端后由后端统一托管,访问 http://localhost:3001
```

## 数据库 Schema

| 表 | 说明 |
|---|---|
| products | 产品总库(product_number 唯一、中英文名、weight、image、remark) |
| product_suppliers | 多供应商(同一件号多个供应商,各自 price / lead_time) |
| customers | 客户档案(name 唯一、country 等) |
| inquiries | 询价单(隶属客户) |
| inquiry_items | 询价明细(件号、供应商、数量、单价、成交状态、成交总价、Currency、PI 来源) |
| quotations | 报价数据库(所有客户混合,与 inquiry_items 联动) |
| pi_uploads | PI 上传记录(文件、Currency、解析摘要) |

## 等待外部模板的功能

以下三处目前为**接口框架 / 临时解析**,等待真实模板后完成最终解析逻辑:

1. **Template 1** 总库 Excel 导入 —— `POST /api/products/import`(文件已接收保存,解析待模板)
2. **Template 2** 客户询价 Excel 导入 —— `POST /api/inquiries/import`(同上)
3. **Template 3** PI 导入 —— `server/src/pi-parser.js`(当前为通用临时解析:匹配客户历史询价件号、行末数值作为成交总价、符号识别 Currency;收到模板后按真实结构重写定位逻辑)

## 当前明确不包含

HS Code 相关全部功能(按需求暂不开发)。
