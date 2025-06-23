import mongoose from "mongoose";

interface DebateSessions {
  rounds: Array<{
    round_number: number;
    responses: string[];
    metrics: number[];
    queries: string | null;
  }>;
}

interface DebateAttrs {
  userId: mongoose.Types.ObjectId;
  question_id: string;
  question: string;
  correct_answer: string;
  question_prompt: string;
  status: string;
  modelConfig: [string, number, number];
  debate_sessions: DebateSessions;
}

export interface DebateDoc extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  question_id: string;
  question: string;
  correct_answer: string;
  question_prompt: string;
  status: string;
  modelConfig: [string, number, number];
  debate_sessions: DebateSessions;
}

interface DebateModel extends mongoose.Model<DebateDoc> {
  build(attrs: DebateAttrs): DebateDoc;
  create_users(topicId: string, numUsers: number): Promise<DebateDoc[]>;
}

const debateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    question_id: {
      type: String,
      required: true
    },
    question: {
      type: String,
      required: true
    },
    correct_answer: {
      type: String,
      required: true
    },
    question_prompt: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true
    },
    modelConfig: {
      type: [mongoose.Schema.Types.Mixed],
      required: true
    },
    debate_sessions: {
      rounds: [{
        round_number: {
          type: Number,
          required: true
        },
        responses: [{
          type: String
        }],
        metrics: [{
          type: Number
        }],
        queries: {
          type: String,
          default: null
        }
      }]
    }
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      }
    }
  }
);

debateSchema.statics.build = (attrs: DebateAttrs) => {
  return new Debates(attrs);
};

debateSchema.statics.create_users = async function(topicId: string, numUsers: number): Promise<DebateDoc[]> {
  const debates: DebateDoc[] = [];
  for (let i = 0; i < numUsers; i++) {
    const debateAttrs: DebateAttrs = {
      userId: new mongoose.Types.ObjectId(),
      question_id: topicId,
      question: '',
      correct_answer: '',
      question_prompt: '',
      status: 'active',
      modelConfig: ['default_model', 0, 0],
      debate_sessions: { rounds: [] }
    };
    debates.push(Debates.build(debateAttrs));
  }
  return debates;
};

const Debates = mongoose.model<DebateDoc, DebateModel>('Debates', debateSchema);

export { Debates };