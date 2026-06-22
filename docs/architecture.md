# Agentic AI Platform — Architecture

> **Living reference — kept current.** Decision history lives in `specs/done/`.

**Stack:** React · Python FastAPI · AWS Strands SDK · AWS Bedrock AgentCore (future)

**Agents (isolated — no cross-agent communication):** Claims Processing · Underwriting · Loan Processing

**Mode:** Demo — no authentication

---

## 1. System Architecture

```mermaid
graph TB
    subgraph FE["Frontend (React / Vite)"]
        ALP["AgentListPage\n(agent cards)"]
        US["User Screen\n(upload docs, track case,\nchat about own case)"]
        SS["Support Screen\n(query any case,\nask about outcomes)"]
        AS["Admin Screen\n(manage rules,\nall support capabilities)"]
    end

    subgraph AGENTS["Agent Services (FastAPI + Uvicorn — EC2)"]
        CA["claims-api :8001"]
        UA["underwriting-api :8002"]
        LA["loan-api :8003"]
    end

    subgraph WORKFLOWS["Strands Workflows (in-process → AgentCore future)"]
        CW["claims_workflow\nStrands Agent"]
        UW["underwriting_workflow\nStrands Agent"]
        LW["loan_workflow\nStrands Agent"]
    end

    subgraph STORAGE["File System Storage (on EC2 — local or mounted)"]
        FS["storage/\n  claims/{case_id}/\n  underwriting/{case_id}/\n  loan/{case_id}/\n  rules/"]
    end

    subgraph BEDROCK["AWS Bedrock"]
        MODEL["Claude Model"]
        AGENTCORE["AgentCore Runtime\n(future — Strands containers)"]
    end

    ALP -->|"select role"| US & SS & AS
    US & SS & AS -->|"REST / SSE"| CA & UA & LA
    CA --> CW
    UA --> UW
    LA --> LW
    CW & UW & LW -->|"read/write"| FS
    CW & UW & LW -->|"invoke model"| MODEL
    CW & UW & LW -.->|"future"| AGENTCORE
```

---

## 2. Project Folder Structure

```mermaid
graph LR
    ROOT["ai-agents-platform/"]
    ROOT --> FE["frontend/"]
    ROOT --> AGENTS["agents/"]
    ROOT --> STORAGE["storage/\n(runtime file system)"]
    ROOT --> TEST["test/"]
    ROOT --> DOCS["docs/"]
    ROOT --> INFRA["infrastructure/\n(CDK TypeScript — future)"]

    FE --> FE_SRC["src/"]
    FE_SRC --> PAGES["pages/\nAgentListPage\nUserChatPage\nSupportChatPage\nAdminChatPage"]
    FE_SRC --> COMPS["components/\nAgentCard\nChatWindow\nMessageBubble\nFileUpload\nApprovalBanner\nRuleEditor\nStatusBadge"]
    FE_SRC --> HOOKS["hooks/\nuseChat\nuseAgentStatus\nuseFileUpload"]
    FE_SRC --> TYPES["types/\nagent.ts\nsession.ts\nroles.ts"]

    AGENTS --> CLAIMS["claims/"]
    AGENTS --> UW["underwriting/"]
    AGENTS --> LOAN["loan/"]
    AGENTS --> FUTURE["... future agents/"]

    CLAIMS --> CAPI["apis/\nmain.py\nroutes.py\nservice.py\nschemas.py\nrequirements.txt\nDockerfile"]
    CLAIMS --> CWF["agentic/\nagent.py\ntools.py\nstate.py\nprompts.py\napproval_hook.py\nmemory_manager.py\nrequirements.txt\nDockerfile"]

    UW --> UAPI["apis/\nmain.py\nroutes.py\nservice.py\nschemas.py"]
    UW --> UWF["agentic/\nagent.py\ntools.py\nstate.py\nprompts.py"]

    LOAN --> LAPI["apis/\nmain.py\nroutes.py\nservice.py\nschemas.py"]
    LOAN --> LWF["agentic/\nagent.py\ntools.py\nstate.py\nprompts.py"]

    STORAGE --> ST_C["claims/{case_id}/\n  input/\n  analysis/\n  decisions/\n  chat_history/"]
    STORAGE --> ST_M["memory/\n  claims_memory.json\n  underwriting_memory.json\n  loan_memory.json\n  (local memory backend)"]

    TEST --> TC["claims/\ntest_claims_api.py"]
    TEST --> TU["underwriting/\ntest_underwriting_api.py"]
    TEST --> TL["loan/\ntest_loan_api.py"]
```

---

## 3. Three Screens Per Agent

Each agent exposes the same chat interface but with role-specific capabilities.

```mermaid
graph TD
    ALP["AgentListPage\n(3 cards: Claims · Underwriting · Loan)"]

    ALP -->|"click Claims"| ROLE["Role Selection\n(no auth — pick role)"]

    ROLE --> US["User Screen\n/agents/claims/user"]
    ROLE --> SS["Support Screen\n/agents/claims/support"]
    ROLE --> ADM["Admin Screen\n/agents/claims/admin"]

    subgraph USER_CAPS["User Capabilities"]
        U1["Upload documents to start processing"]
        U2["Ask: 'What is the status of my claim?'"]
        U3["Ask: 'Why was my claim rejected?'"]
        U4["Provide additional info when requested"]
    end

    subgraph SUPPORT_CAPS["Support Capabilities"]
        S1["Query any case by case_id"]
        S2["Ask: 'What happened in claim CLAIM-001?'"]
        S3["Ask: 'Why was this approved/rejected?'"]
        S4["View processing timeline and decisions"]
    end

    subgraph ADMIN_CAPS["Admin / Supervisor Capabilities"]
        A1["Everything support can do"]
        A2["Add / modify agent rules"]
        A3["'Add rule: claims over $50k need 2 approvals'"]
        A4["'Remove rule: auto-approve claims under $500'"]
        A5["View and audit current ruleset"]
    end

    US -.-> USER_CAPS
    SS -.-> SUPPORT_CAPS
    ADM -.-> ADMIN_CAPS
```

---

## 4. Frontend Component Tree

```mermaid
graph TD
    APP["App (React Router — no auth)"]
    APP --> ALP["AgentListPage"]

    ALP --> AC1["AgentCard [claims]"]
    ALP --> AC2["AgentCard [underwriting]"]
    ALP --> AC3["AgentCard [loan]"]

    AC1 --> ROLE["RoleSelectPage\n/agents/claims"]

    ROLE --> UP["UserChatPage\n/agents/claims/user"]
    ROLE --> SP["SupportChatPage\n/agents/claims/support"]
    ROLE --> AP["AdminChatPage\n/agents/claims/admin"]

    UP --> CW_U["ChatWindow [user]\n+ FileUpload\n+ ApprovalBanner\n+ StatusBadge"]
    SP --> CW_S["ChatWindow [support]\n+ CaseSearch\n+ StatusBadge"]
    AP --> CW_A["ChatWindow [admin]\n+ CaseSearch\n+ RulePanelSidebar\n+ StatusBadge"]

    subgraph SHARED["Shared Components"]
        MB["MessageBubble"]
        ST["StreamingText (SSE)"]
        TEX["ToolExecutionBadge"]
        CIA["ChatInputArea"]
        FU["FileUpload\n(drag-drop + browse)"]
    end

    CW_U & CW_S & CW_A -.-> SHARED

    subgraph HOOKS["Custom Hooks"]
        UCH["useChat — POST /chat/:sessionId SSE"]
        UAS["useAgentStatus — GET /status/:sessionId"]
        UFU["useFileUpload — POST /upload"]
    end

    CW_U & CW_S & CW_A -.-> HOOKS
```

---

## 5. API Contract (identical shape for every agent)

```mermaid
graph LR
    subgraph API["FastAPI — e.g. claims-api :8001"]

        subgraph PROCESS_GRP["Processing (dual entry)"]
            R1["POST /process\nbody: ProcessRequest\n{case_id, payload, role, user_id}\nresp: {session_id, status}"]
            R1B["POST /upload\nbody: multipart file\nresp: {file_ref, session_id}"]
        end

        subgraph CHAT_GRP["Chat (all roles)"]
            R5["POST /chat/{session_id}\nbody: ChatRequest\n{message, role, user_id}\nresp: SSE stream"]
        end

        subgraph STATUS_GRP["Status"]
            R2["GET /status/{session_id}\nresp: WorkflowStatus"]
            R6["GET /sessions\nquery: role, user_id\nresp: Session[]"]
        end

        subgraph APPROVAL_GRP["Human Approval"]
            R3["POST /approve/{session_id}"]
            R4["POST /reject/{session_id}"]
        end

        subgraph RULES_GRP["Rules (admin only)"]
            RR1["GET /rules\nresp: RuleSet"]
            RR2["POST /rules\nbody: RuleSet\nresp: {status}"]
        end

        subgraph HEALTH_GRP["Health"]
            R7["GET /ping"]
        end
    end
```

---

## 6. Dual Entry Point — Document Submission

Documents can be submitted via the chat window **or** directly via the `/process` API (e.g., from test scripts).

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (User Screen)
    participant API as claims-api
    participant WF as Strands Workflow
    participant FS as File System

    Note over User,FS: Path A — Chat window upload

    User->>FE: Drag-drop claim document in chat
    FE->>API: POST /upload {file, user_id}
    API->>FS: storage/claims/{case_id}/input/doc.pdf
    API-->>FE: {file_ref, case_id}
    FE->>API: POST /chat/{session_id}\n{message: "I've uploaded my claim", role: user}
    API->>WF: agent sees file_ref in context
    WF->>FS: read document
    WF->>WF: begin processing

    Note over User,FS: Path B — Direct API (test scripts / integrations)

    User->>API: POST /process\n{case_id, payload, documents[]}
    API->>FS: storage/claims/{case_id}/input/
    API->>WF: workflow.start(session_id, payload)
    WF->>WF: begin processing
    API-->>User: {session_id, status: INITIATED}
```

---

## 7. Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> INITIATED : POST /process or chat upload

    INITIATED --> PROCESSING : workflow.start()

    PROCESSING --> PENDING_HUMAN_APPROVAL : analysis complete\ninterrupt() called

    PENDING_HUMAN_APPROVAL --> APPROVED : POST /approve
    PENDING_HUMAN_APPROVAL --> REJECTED : POST /reject

    APPROVED --> CLOSING : post-approval steps
    CLOSING --> CLOSED : complete

    REJECTED --> CLOSED : record reason

    CLOSED --> [*]

    note right of PROCESSING
        All roles can chat
        Agent reads from file system
    end note

    note right of PENDING_HUMAN_APPROVAL
        Workflow PAUSED
        State on file system
        Chat still served
    end note

    note right of CLOSED
        All roles can query
        Read-only Q&A
    end note
```

---

## 8. Processing Flow — End-to-End

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant API as claims-api
    participant WF as Strands Workflow
    participant FS as File System
    participant LLM as AWS Bedrock (Claude)

    User->>FE: Upload claim document
    FE->>API: POST /process {case_id, payload}
    API->>FS: Write input to storage/claims/{case_id}/input/
    API->>WF: workflow.start(session_id) [async]
    API-->>FE: {session_id, status: INITIATED}

    WF->>FS: UPDATE status.json → PROCESSING
    WF->>LLM: analyse documents + apply rules
    LLM-->>WF: analysis + recommendation
    WF->>FS: Write analysis/ and decisions/

    WF->>WF: interrupt("human-approval", summary)
    WF->>FS: UPDATE status.json → PENDING_HUMAN_APPROVAL
    WF-->>FE: SSE {type: status_change}

    FE->>User: Show ApprovalBanner

    User->>FE: Approve
    FE->>API: POST /approve/{session_id}
    API->>FS: Write approval_record.json
    API->>WF: resume(decision=approved)

    WF->>LLM: generate closure summary
    WF->>FS: Write closure/ summary
    WF->>FS: UPDATE status.json → CLOSED
    WF-->>FE: SSE {type: status_change, status: CLOSED}
```

---

## 9. Chat Flow — SSE Streaming (all roles)

```mermaid
sequenceDiagram
    actor Person
    participant FE as Frontend
    participant API as claims-api
    participant WF as Strands Agent
    participant FS as File System
    participant LLM as AWS Bedrock (Claude)

    Person->>FE: Type message (any role)
    FE->>API: POST /chat/{session_id} {message, role}
    API->>WF: agent(message, role=role, session_id=session_id)

    WF->>FS: load conversation history
    WF->>FS: load case files (if role=support/admin)
    WF->>LLM: invoke with context + role instructions
    LLM-->>WF: stream tokens
    WF-->>API: yield text-delta events
    WF->>FS: save updated conversation history
    WF-->>API: yield done event

    API-->>FE: SSE stream
    FE->>Person: Display response
```

---

## 10. Human-in-the-Loop — Pause / Resume

```mermaid
sequenceDiagram
    participant WF as Strands Workflow
    participant HOOK as ApprovalHook
    participant FS as File System
    participant API as FastAPI
    participant FE as Frontend
    actor Supervisor

    WF->>HOOK: interrupt("human-approval", summary)
    HOOK->>FS: WRITE status.json — PENDING_HUMAN_APPROVAL
    HOOK->>FS: WRITE interrupt.json — {summary, interrupt_id}
    HOOK->>FE: SSE {type:interrupt, payload}
    HOOK-->>WF: asyncio.Event.wait() — PAUSED

    Note over WF: Workflow suspended.\nAll case files on disk.\nChat still works.

    FE->>Supervisor: ApprovalBanner
    Supervisor->>FE: Approve / Reject
    FE->>API: POST /approve/{session_id}
    API->>FS: WRITE approval_record.json
    API->>FS: UPDATE status.json → APPROVED
    API->>WF: asyncio.Event.set()

    WF->>WF: resume with decision
    WF->>FS: WRITE closure files
    WF->>FS: UPDATE status.json → CLOSED
```

---

## 11. Agent Memory — Rules Storage

Rules are stored in agent memory — **not** on the file system. Locally this is a JSON-backed `LocalMemoryStore`; on AgentCore it becomes `AgentCoreMemorySessionManager` with no code change.

```mermaid
graph LR
    subgraph LOCAL["Local (ENV=local)"]
        LM["LocalMemoryStore\nstorage/memory/claims_memory.json\n\nstores:\n  - rules[]\n  - conversation history\n  - agent preferences"]
    end

    subgraph EC2["EC2 (ENV=ec2)"]
        EM["LocalMemoryStore\n/opt/ai-agents/storage/memory/\nclaims_memory.json\n(same code, different path)"]
    end

    subgraph AGENTCORE["AgentCore (ENV=agentcore)"]
        AM["AgentCoreMemorySessionManager\nManaged memory service\nBuilt-in compaction + LTM\nRules persist across deployments"]
    end

    LOCAL -->|"change STORAGE_PATH\nenv var only"| EC2
    EC2 -->|"swap MEMORY_BACKEND=agentcore\nenv var only"| AGENTCORE
```

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Admin Screen
    participant API as claims-api
    participant WF as Strands Agent
    participant MEM as MemoryManager\n(local or AgentCore)

    Note over Admin,MEM: View current rules

    Admin->>FE: Open Admin Screen
    FE->>API: GET /rules
    API->>MEM: memory.get("agent_rules")
    MEM-->>API: RuleSet {rules: [...]}
    API-->>FE: RuleSet
    FE->>Admin: Show rules in sidebar

    Note over Admin,MEM: Add a rule via chat

    Admin->>FE: "Add rule: claims over $50,000 need two approvals"
    FE->>API: POST /chat/{session_id} {message, role: admin}
    API->>WF: agent(message, role=admin)
    WF->>WF: detect rule-change intent
    WF->>MEM: memory.set("agent_rules", updated_rules)
    MEM-->>WF: saved
    WF-->>FE: "Rule added: claims over $50,000 require two approvals."

    Note over Admin,MEM: Rule applied on next processing run

    WF->>MEM: memory.get("agent_rules") on every invocation
    WF->>WF: inject rules into system prompt
```

---

## 12. File System Storage Layout

All **processing artifacts** live on the file system. **Rules live in agent memory** (separate). Support and admin query the agent to look up any case.

```mermaid
graph LR
    subgraph FS["storage/ (on EC2 or local)"]
        subgraph CLAIMS["claims/"]
            CC["{case_id}/\n  input/\n    uploaded_doc.pdf\n  analysis/\n    analysis_result.json\n  decisions/\n    decision_log.json\n  chat_history/\n    user_chat.json\n    support_chat.json\n    admin_chat.json\n  status.json\n  interrupt.json\n  approval_record.json\n  closure_summary.json"]
        end

        subgraph UW_FS["underwriting/"]
            UC["{case_id}/\n  (same structure)"]
        end

        subgraph LOAN_FS["loan/"]
            LC["{case_id}/\n  (same structure)"]
        end

        subgraph MEM_FS["memory/\n(local memory backend only)"]
            MC["claims_memory.json\nunderwriting_memory.json\nloan_memory.json\n\nContains: rules + agent LTM\nReplaced by AgentCore Memory\nwhen deployed to AgentCore"]
        end
    end
```

---

## 13. Agent Module Internal Architecture

> Claims shown — Underwriting and Loan are structurally identical.

```mermaid
graph TB
    subgraph CLAIMS_API["claims/apis/"]
        MAIN["main.py\nFastAPI + uvicorn\nCORS"]
        ROUTES["routes.py\n/process /upload /chat/:id\n/status/:id /approve/:id\n/reject/:id /sessions\n/rules GET+POST"]
        SERVICE["service.py\nClaimsService\ncreate_session()\nchat(role)\nrecord_approval()\nresume_workflow()"]
        SCHEMAS["schemas.py\nProcessRequest\nChatRequest (+ role)\nWorkflowStatus\nRuleSet"]
    end

    subgraph CLAIMS_WF["claims/agentic/"]
        AGENT["agent.py\nClaimsAgent\nrole-aware system prompt\nrules injected from memory"]
        TOOLS["tools.py\n@tool read_case_files\n@tool search_cases\n@tool policy_lookup\n@tool fraud_check\n@tool document_parser"]
        STATE["state.py\nWorkflowState\nFile-based r/w\nstorage/{case_id}/status.json"]
        MEM_MGR["memory_manager.py\ncreate_memory_backend()\n  local → LocalMemoryStore\n  agentcore → AgentCoreMemory\nget_rules() / set_rules()\nget_history() / save_history()"]
        PROMPTS["prompts.py\nSYSTEM_PROMPT\nROLE_INSTRUCTIONS\n  user / support / admin\nRULES_TEMPLATE"]
        APPROVAL_HOOK["approval_hook.py\nApprovalHook\nasyncio.Event\npause / resume"]
    end

    MAIN --> ROUTES --> SERVICE
    SERVICE --> AGENT

    AGENT --> TOOLS
    AGENT --> MEM_MGR
    AGENT --> PROMPTS
    AGENT --> APPROVAL_HOOK
    TOOLS --> STATE
    APPROVAL_HOOK --> STATE
```

---

## 14. Deployment Architecture

```mermaid
graph TB
    subgraph LOCAL["Local Development (all on localhost)"]
        LFE["React\nlocalhost:3000"]
        LC["claims-api\nlocalhost:8001"]
        LU["underwriting-api\nlocalhost:8002"]
        LL["loan-api\nlocalhost:8003"]
        LFS["./storage/\n(local file system)"]
        LFE --> LC & LU & LL
        LC & LU & LL --> LFS
    end

    subgraph EC2["AWS EC2 Deployment"]
        subgraph EC2_FE["EC2 — Frontend"]
            NGINX["Nginx\nserving React build"]
        end

        subgraph EC2_API["EC2 — Agent APIs (1 instance or 1 per agent)"]
            ECA["claims-api :8001\nuvicorn"]
            EUA["underwriting-api :8002\nuvicorn"]
            ELA["loan-api :8003\nuvicorn"]
            EFS["/opt/ai-agents/storage/\n(EC2 volume)"]
            ECA & EUA & ELA --> EFS
        end

        NGINX -->|"proxy_pass"| ECA & EUA & ELA
    end

    subgraph AGENTCORE["AgentCore Migration (Strands workflows only)"]
        ACW["claims-workflow Docker"]
        AUW["underwriting-workflow Docker"]
        ALW["loan-workflow Docker"]
        AMEM["AgentCore Memory\n(replaces FileSessionManager)"]
        ACW & AUW & ALW --> AMEM
    end

    subgraph BEDROCK["AWS Bedrock (always cloud)"]
        MODEL["Claude Model"]
    end

    LOCAL -->|"Step 1 — deploy to EC2\nno code change\nenv vars only"| EC2
    EC2 -->|"Step 2 — move Strands workflows\nto AgentCore containers"| AGENTCORE
    LOCAL & EC2 & AGENTCORE --> MODEL
```

### Environment Config Matrix

```mermaid
graph LR
    E1["ENV=local\nSTORAGE_PATH=./storage\nSESSION_BACKEND=file\nWORKFLOW_MODE=in_process"]
    E2["ENV=ec2\nSTORAGE_PATH=/opt/ai-agents/storage\nSESSION_BACKEND=file\nWORKFLOW_MODE=in_process"]
    E3["ENV=agentcore\nSTORAGE_PATH=s3://bucket/storage\nSESSION_BACKEND=agentcore_memory\nWORKFLOW_MODE=agentcore_runtime"]

    E1 -->|"no code change"| E2
    E2 -->|"swap session manager"| E3
```

---

## 15. Implementation Phases

```mermaid
graph LR
    P1["Phase 1\nScaffold\nfolder structure\n+ storage layout\n+ .env setup"] --> P2
    P2["Phase 2\nReact frontend\nAgentListPage\nRole select\n3 screens per agent\nFileUpload + SSE hooks\n(mock API responses)"] --> P3
    P3["Phase 3\nClaims APIs\nFastAPI + uvicorn\nall endpoints\nSSE streaming\napproval flow\nrules endpoints"] --> P4
    P4["Phase 4\nClaims Strands\nagentic workflow\ntools + memory\napproval hook\nrole-aware prompts"] --> P5
    P5["Phase 5\nClone pattern\nUnderwriting\n+ Loan agents\n(apis + agentic)"] --> P6
    P6["Phase 6\nEC2 deploy\nNginx + systemd\nenv var swap\nfor EC2 paths"] --> P7
    P7["Phase 7\nDockerize\nagentic workflows\nAgentCore\nmigration\n(swap MemoryManager)"]
```

---

## Key Reference Files (sample code)

| Reference file | Pattern used for |
|---|---|
| `agent-blueprint/agentcore-runtime-a2a-stack/research-agent/src/main.py` | MetadataAwareExecutor, session isolation, streaming |
| `agent-blueprint/agentcore-runtime-a2a-stack/research-agent/src/report_manager.py` | File-based session workspace, path validation, thread-safe writes |
| `agent-blueprint/agentcore-runtime-mcp-stack/src/mcp_server.py` | FastAPI + AgentCore entrypoint |
| `agent-blueprint/agentcore-runtime-mcp-stack/Dockerfile` | Container packaging for AgentCore |
| `agent-blueprint/agentcore-gateway-stack/infrastructure/lib/gateway-stack.ts` | CDK MCP Gateway with SigV4 |
| `agent-blueprint/agentcore-runtime-stack/lib/agent-runtime-stack.ts` | ECR + IAM + CodeBuild CDK |

---

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth | None (demo) | Simplicity — role is passed as a param in each request |
| Storage | Local file system | Zero-infra, portable, human-readable, queryable by agent tools |
| Rule storage | Agent memory (`LocalMemoryStore` locally, `AgentCoreMemory` on AgentCore) | Rules are part of agent LTM — portable, no separate file path, swapped via env var |
| Agent role awareness | `role` param in ChatRequest → injected into system prompt | Single agent serves all 3 screens with role-specific behaviour |
| Document entry | Chat upload OR POST /process API | Supports both interactive and programmatic submission |
| Human approval pause | `asyncio.Event` in workflow coroutine | Non-blocking, state survives on FS, resumable without restart |
| Streaming | Server-Sent Events (SSE) | Simpler than WebSockets for unidirectional token streaming |
| Hosting | EC2 + Nginx (not Fargate) | Simple, directly accessible, no orchestration overhead for demo |
| AgentCore migration | Swap `FileSessionManager` → `AgentCoreMemorySessionManager` via env var | Zero code change to migrate Strands workflow to cloud runtime |
