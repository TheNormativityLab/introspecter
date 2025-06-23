import mongoose from "mongoose";

interface UserAttrs {
  name: string;
  password: string;
}

export interface UserDoc extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  password: string;
}

interface UserModel extends mongoose.Model<UserDoc> {
  build(attrs: UserAttrs): UserDoc;
  create_users(topicId: string, numUsers: number): Promise<UserDoc[]>;
}

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
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

userSchema.statics.build = (attrs: UserAttrs) => {
  return new Users(attrs);
};

userSchema.statics.create_users = async function(topicId: string, numUsers: number): Promise<UserDoc[]> {
  const users: UserDoc[] = [];
  for (let i = 0; i < numUsers; i++) {
    const user = Users.build({
      name: `user_${i + 1}`,
      password: `password_${i + 1}`
    });
    await user.save();
    users.push(user);
  }
  return users;
};

const Users = mongoose.model<UserDoc, UserModel>('User', userSchema);

export { Users };